#!/usr/bin/env python3
"""把 loongsite 部署到自有服务器（paramiko 单会话完成）。

传输层说明：移动宽带会针对 SSH 协议内容做拦截（TCP/banner 都通，客户端握手包
被静默丢弃；换端口无效）。默认走服务器上 stunnel 的 TLS 通道（8443，TLS 里跑
SSH），并保留直连 22 作为回退；如需走 LA 跳板设 LOONGSITE_SSH_TRANSPORT=relay。

用法：
    python scripts/deploy-server.py               # 设计门禁 + 构建 + 上传 + 切换 + 重载 nginx
    python scripts/deploy-server.py --skip-build  # 跳过 node 构建（打包仍按当前文件重新做）
    python scripts/deploy-server.py --skip-verify # 跳过设计门禁（慎用）

凭据：项目根目录 .env.local 里的 LOONGSITE_SERVER_HOST / LOONGSITE_SERVER_PASS
"""
import os
import pathlib
import shutil
import socket
import ssl
import struct
import subprocess
import sys
import tarfile
import time

import paramiko

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEBROOT = '/var/www/loongsite'
KEEP_RELEASES = 5
ATTEMPTS = 15
SHIP_ATTEMPTS = 3    # 上传+切换整段的重试次数（链路半途被掐时自动重来）
GAP_SECONDS = 15
ITEMS = ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'assets', 'projects', 'sites', 'blog']
TLS_PORT = 8443
TLS_SNI = 'loongsite.com'


def load_env():
    env = {}
    path = ROOT / '.env.local'
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env[key.strip()] = value.strip()
    return env


def tls_socket(host, timeout=20):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    raw = socket.create_connection((host, TLS_PORT), timeout=timeout)
    return ctx.wrap_socket(raw, server_hostname=TLS_SNI)


def socks5_socket(proxy_host, proxy_port, dst_host, dst_port, timeout=20):
    s = socket.create_connection((proxy_host, proxy_port), timeout=timeout)
    s.sendall(b'\x05\x01\x00')
    if s.recv(2) != b'\x05\x00':
        raise OSError('SOCKS5 greeting failed')
    hb = dst_host.encode()
    s.sendall(b'\x05\x01\x00\x03' + bytes([len(hb)]) + hb + struct.pack('>H', dst_port))
    head = s.recv(4)
    if len(head) < 4 or head[1] != 0:
        raise OSError('SOCKS5 CONNECT rejected')
    atyp = head[3]
    if atyp == 1:
        s.recv(4)
    elif atyp == 3:
        s.recv(s.recv(1)[0])
    elif atyp == 4:
        s.recv(16)
    s.recv(2)
    return s


def open_socket(kind, host):
    if kind == 'tls':
        return tls_socket(host)
    if kind == 'relay':
        return socks5_socket('127.0.0.1', 7905, host, 22)
    return socket.create_connection((host, 22), timeout=15)


def build_and_stage(skip_build=False):
    if not skip_build:
        subprocess.run(['node', 'scripts/build.mjs'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    stage = ROOT / '_stage-server'
    site = stage / 'site'
    if site.exists():
        shutil.rmtree(site)
    site.mkdir(parents=True)
    for item in ITEMS:
        src = ROOT / item
        if not src.exists():
            continue
        if src.is_dir():
            shutil.copytree(src, site / item)
        else:
            shutil.copy2(src, site / item)
    tgz = stage / 'site.tar.gz'
    if tgz.exists():
        tgz.unlink()
    with tarfile.open(tgz, 'w:gz') as tf:
        for child in sorted(site.iterdir()):
            tf.add(child, arcname=child.name, recursive=True)
    return tgz


def connect(host, password):
    plan = [p.strip() for p in os.environ.get('LOONGSITE_SSH_TRANSPORT', 'tls,direct').split(',') if p.strip()]
    last = None
    attempt = 0
    while attempt < ATTEMPTS:
        for kind in plan:
            attempt += 1
            try:
                sock = open_socket(kind, host)
                transport = paramiko.Transport(sock)
                transport.banner_timeout = 20
                transport.start_client(timeout=20)
                transport.auth_password('root', password)
                if transport.is_authenticated():
                    transport.set_keepalive(15)
                    print(f'[ssh] 第 {attempt} 次连接成功（{kind}）')
                    return transport
            except Exception as exc:  # noqa: BLE001
                last = exc
                print(f'[ssh] 第 {attempt} 次失败（{kind}）：{type(exc).__name__}')
            if attempt < ATTEMPTS:
                time.sleep(GAP_SECONDS)
    raise SystemExit(f'SSH 连续 {ATTEMPTS} 次失败：服务器异常或链路被阻断（最后错误 {last!r}）')


def run(transport, cmd, timeout=180):
    chan = transport.open_session()
    chan.settimeout(timeout)
    chan.set_combine_stderr(True)
    chan.exec_command(cmd)
    data = b''
    while True:
        if chan.recv_ready():
            data += chan.recv(65536)
            continue
        if chan.exit_status_ready():
            try:
                while chan.recv_ready():
                    data += chan.recv(65536)
            except Exception:  # noqa: BLE001
                pass
            break
        time.sleep(0.2)
    code = chan.recv_exit_status()
    chan.close()
    return code, data.decode('utf-8', 'replace').strip()


def ship(host, password, tgz):
    """上传 + 原子切换，整段带重试：链路会间歇性在半途掐断（sftp.put 抛 Socket is closed）。
    远端脚本是幂等的（rm -rf .incoming → 解包 → 原子切换），失败重跑安全。"""
    last = None
    for attempt in range(1, SHIP_ATTEMPTS + 1):
        transport = None
        try:
            transport = connect(host, password)
            sftp = paramiko.SFTPClient.from_transport(transport)
            sftp.put(str(tgz), '/root/loongsite-site.tar.gz')
            sftp.put(str(ROOT / 'deploy' / 'nginx-loongsite.conf'), '/etc/nginx/conf.d/loongsite.conf')
            sftp.close()
            code, out = run(transport, f'''
set -e
rm -rf {WEBROOT}/.incoming && mkdir -p {WEBROOT}/.incoming
tar -xzf /root/loongsite-site.tar.gz -C {WEBROOT}/.incoming
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p {WEBROOT}/releases {WEBROOT}/acme
if [ -d {WEBROOT}/current ]; then cp -a {WEBROOT}/current {WEBROOT}/releases/$TS; fi
rm -rf {WEBROOT}/current.new && mv {WEBROOT}/.incoming {WEBROOT}/current.new
rm -rf {WEBROOT}/current && mv {WEBROOT}/current.new {WEBROOT}/current
chmod -R a+rX {WEBROOT}/current
ls -1dt {WEBROOT}/releases/* 2>/dev/null | tail -n +{KEEP_RELEASES + 1} | xargs -r rm -rf
nginx -t >/dev/null 2>&1 && systemctl reload nginx && echo NGINX-RELOADED
echo 文件数=$(find {WEBROOT}/current -type f | wc -l)
''')
            if code != 0:
                raise RuntimeError(f'远端脚本 rc={code}\n{out}')
            print(f'[deploy] rc={code}\n{out}')
            run(transport, 'rm -f /root/loongsite-site.tar.gz')
            return
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f'[ship] 第 {attempt} 次上传/切换失败：{type(exc).__name__}: {str(exc)[:140]}')
            if attempt < SHIP_ATTEMPTS:
                time.sleep(GAP_SECONDS)
        finally:
            if transport is not None:
                try:
                    transport.close()
                except Exception:  # noqa: BLE001
                    pass
    raise SystemExit(f'[ship] 连续 {SHIP_ATTEMPTS} 次上传失败（最后 {last!r}）')


def main():
    env = load_env()
    host = env.get('LOONGSITE_SERVER_HOST')
    password = env.get('LOONGSITE_SERVER_PASS')
    if not host or not password:
        raise SystemExit('.env.local 里缺 LOONGSITE_SERVER_HOST / LOONGSITE_SERVER_PASS')

    if '--skip-verify' not in sys.argv:
        print('[verify] 设计门禁：npm run check + audit …')
        npm = shutil.which('npm') or 'npm'
        subprocess.run([npm, 'run', 'check'], cwd=ROOT, check=True, shell=(os.name == 'nt'))
        subprocess.run([sys.executable, 'scripts/audit-design.py'], cwd=ROOT, check=True)
        print('[verify] 设计门禁通过 ✓')

    # --skip-build 只跳过 node 构建；打包永远按当前工作区重新做。
    # （曾因「复用旧 tar」把过期包发上线：tar 存在与否不能决定发什么，源文件说了算。）
    tgz = build_and_stage(skip_build='--skip-build' in sys.argv)
    print(f'[pack] {tgz.name}（{tgz.stat().st_size // 1024} KB）{"（跳过 node 构建）" if "--skip-build" in sys.argv else ""}')

    ship(host, password, tgz)
    print(f'[done] 线上验收：curl -H "Host: loongsite.com" http://{host}/')


if __name__ == '__main__':
    main()
