import http.server
import socketserver

PORT = 8080

Handler = http.server.SimpleHTTPRequestHandler

# Force the correct MIME type for JavaScript
Handler.extensions_map['.js'] = 'application/javascript'
Handler.extensions_map['.css'] = 'text/css'
Handler.extensions_map['.html'] = 'text/html'

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    print("MIME types for .js files have been explicitly set to application/javascript")
    httpd.serve_forever()
