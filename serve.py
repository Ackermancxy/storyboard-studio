#!/usr/bin/env python3
"""storyboard 静态服务：禁用缓存（本地工具天天改，缓存只会坑人）"""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5219
ROOT = sys.argv[2] if len(sys.argv) > 2 else "/home/cxy/storyboard/dist"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
