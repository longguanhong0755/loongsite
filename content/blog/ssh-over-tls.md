---
title: 换端口没用：一次 SSH 内容级拦截的排查与伪装
date: 2026-10-16
summary: 家里连自己的服务器：TCP 通、banner 能收到，客户端第一个握手包却石沉大海，换端口症状照旧——是按内容拦的。记录排查过程，以及最后把 SSH 套进 TLS、伪装成普通 HTTPS 流量的实现。
tags: 网络, SSH, TLS
---

## 现象

10 月 15 日晚上，本站刚在这台自有服务器上跑通 HTTPS，我准备再推一版更新，SSH 却连不上了。

不是那种模糊的"连不上"。当时的现象分三段，一段比一段具体：

- TCP 连接能正常建立，服务器的 SSH banner 也正常返回；
- 客户端（ssh）把自己的第一个握手包发出去之后，会话就没了下文——没有 RST、没有报错，就是再也不回来东西；
- `ssh -vvv` 的最后一行停在 `SSH2_MSG_KEXINIT sent`，然后一路超时。

用裸 socket 观察是这样的（文里服务器 IP 用 `x.x.x.x` 代替）：

```bash
$ nc -v x.x.x.x 22
Connection to x.x.x.x 22 port [tcp/ssh] succeeded!
SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.18
# 发出自己的握手包之后，这里就再也不会有任何回音
```

对照实验把范围缩得很小：同一台服务器的 443（真正的网站）访问完全正常；从另一台不受影响的机器连这台服务器的 22，也一切正常。**问题只在这条家宽线路、只对 SSH 会话。**

## 换端口，症状照旧

第一反应是"22 端口被封了"——网上最常见的那个解释。于是我把 sshd 挪到别的端口、防火墙如实放行，再连：TCP 通、banner 在、客户端一发握手包就死。症状一模一样。

到这一步，"封端口"的解释就站不住了：**它根本不在乎端口号**，每次都恰好在同一个位置精确掐断，而那正是这条流里第一次出现 SSH 协议特征的地方。结论：这是按内容拦的。

（顺带验证了这不是针对某一台机器：同一个网络下，我连另一台完全无关的服务器，22 也是一样的下场。这条线对 SSH 协议本身有意见。）

## 思路：要么换路，要么换皮

拦截的对象是"链路上出现了 SSH 内容"，那解法无非两类：

1. **换路**——用一台不受影响的机器做 `ProxyJump` 中转。能用，但多一台机器就多一个故障点、一段额外延迟和一份密钥管理；适合当备用。
2. **换皮**——把 SSH 套进 TLS，让链路上流动的全部是标准加密流量，和你的网银、和本站的 HTTPS 长得没有区别。
3. （现成的内网穿透 / 隧道服务也能办，但要引入额外组件和账号依赖；这条链路我更想保持零依赖。）

选了换皮，结构就变成：

```
ssh 客户端
  └─► tls_proxy.py（本地套上 TLS，SNI 用本站域名）
        ═════ 线路上只有标准 TLS 流量 ═════►  服务器 :8443（stunnel）
                                                └─► 127.0.0.1:22（原样的 sshd）
```

SSH 本身一行没改：它还是那个 SSH，只是从一条裸 TCP 连接，改为从一条 TLS 会话里穿过去。

## 服务端：stunnel 把 SSH 包进 TLS

服务端用 stunnel，它只干一件事：接受 TLS 连接，解密后把里面的字节原样转发给本地端口。对 SSH 来说，这层不存在。

```ini
# /etc/stunnel/stunnel.conf
[https-ssh]
accept  = 8443
connect = 127.0.0.1:22
cert    = /etc/stunnel/ssh-tls.crt
key     = /etc/stunnel/ssh-tls.key
```

两个选择说明：

- **为什么是 8443**：443 被真正的网站占着（本站的 HTTPS 就在上面）。8443 是约定俗成的"备用 HTTPS"端口，从外面看同样是一次普通的 HTTPS 连接。
- **为什么证书自签就行**：这层 TLS 是外壳，不是安全边界。真正的身份验证由 SSH 自己完成——主机密钥加上登录凭据，TLS 层就算被调包也过不了 SSH 那一关。所以生成一份自签证书（CN 就写本站域名，十年有效期）完全够用。

安装、生成证书、启用服务：

```bash
sudo apt install stunnel4
sudo openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout /etc/stunnel/ssh-tls.key \
    -out    /etc/stunnel/ssh-tls.crt \
    -subj "/CN=loongsite.com"
sudo systemctl enable --now stunnel4
```

sshd 原地不动，还是 22。经 TLS 通道进来的连接被 stunnel 解密后落到 `127.0.0.1:22`，对 sshd 来说和本地登录没有区别。

## 客户端：ProxyCommand + 三十行脚本

客户端靠 SSH 自带的 `ProxyCommand`：它允许把"怎么打开到服务器的字节流"替换成任意命令。ssh 只管读写标准输入输出，不需要知道底下是 TCP 还是 TLS。

写了个小脚本干三件事：连上 8443、套上 TLS、和 stdin/stdout 对接。

```python
#!/usr/bin/env python3
"""SSH ProxyCommand：到 host:port 建立裸 TLS 隧道，然后对接 stdin<->socket。
用法: tls_proxy.py <host> <port> <sni>
（不校验证书——身份校验交给 SSH 主机密钥）"""
import socket, ssl, sys, threading

host, port, sni = sys.argv[1], int(sys.argv[2]), sys.argv[3]
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
raw = socket.create_connection((host, port), timeout=25)
s = ctx.wrap_socket(raw, server_hostname=sni)

def pump_in():
    try:
        while True:
            d = sys.stdin.buffer.read1(65536)
            if not d:
                break
            s.sendall(d)
    except Exception:
        pass
    try:
        s.shutdown(socket.SHUT_WR)
    except Exception:
        pass

threading.Thread(target=pump_in, daemon=True).start()
try:
    while True:
        d = s.recv(65536)
        if not d:
            break
        sys.stdout.buffer.write(d)
        sys.stdout.buffer.flush()
except Exception:
    pass
```

挂进 `~/.ssh/config`：

```
Host loongsite-vps
    HostName x.x.x.x
    User root
    ProxyCommand python /path/to/tls_proxy.py x.x.x.x 8443 loongsite.com
```

之后 `ssh loongsite-vps` 就和直连一样自然。额外的好处是：`ProxyCommand` 在 SSH 协议层之下，所以 `scp`、`git`、以及我那套自写的部署脚本（Python + paramiko——同一个思路的直接版：建 socket、包 TLS、交给它当网络用）全都自动走这条通道，一个都不用单独改。

## 验证：外面看就是一次普通 HTTPS

从被拦的这条线路上，直接看 8443 的模样：

```bash
$ openssl s_client -connect x.x.x.x:8443 -servername loongsite.com -brief
CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Ciphersuite: TLS_AES_256_GCM_SHA384
Peer certificate: CN=loongsite.com
Verification error: self-signed certificate
SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.18
```

标准的 TLS 1.3 握手、一张写着本站域名的证书；最后那行 SSH banner 是握手之后里层 sshd 打招呼、穿过隧道透出来的——外面是 TLS、里面是 SSH，一眼两清。而 `ssh loongsite-vps` 照常进得去。

## 现在的分工

- `loongsite-vps`：走 TLS 通道，默认路线；
- `loongsite-vps-direct`：直连 22，留给不受影响的网络；
- 部署脚本：TLS 优先，连不上自动回退直连。

顺带一句时效：写这篇文章时我又从家里试了一次直连 22，居然是通的——这类拦截时有时无，各时段表现并不一致。但通道既然已经在了，就继续当默认路线用：它不依赖对面今天的心情。

## 小结

- 症状：TCP 通、banner 在、客户端握手包被静默丢弃 → 不是封端口，是按内容拦；
- 解法：服务端 stunnel 在 8443 把 SSH 套进 TLS，客户端 `ProxyCommand` + 三十行脚本接入；
- 性质：零第三方依赖、不改 SSH、全链路标准 TLS；鉴权不受影响（那层 TLS 只是外壳）。

这套办法针对的是"按明文内容识别 SSH"的拦截。如果哪天对面能看更细的流量特征，这层外皮就不够了——那时候要换的就不只是端口和外壳，而是一个更像真实应用的载体。
