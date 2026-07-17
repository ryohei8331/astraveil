#!/bin/bash
# ASTRAVEIL ローカルサーバ起動(スマホから遊ぶ用)
cd "$(dirname "$0")"
PORT=8765
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
echo "======================================"
echo "  ASTRAVEIL を起動します"
echo "  PC:     http://localhost:${PORT}"
echo "  スマホ: http://${IP}:${PORT}  (同一Wi-Fi)"
echo "  終了は Ctrl+C"
echo "======================================"
(sleep 1 && open "http://localhost:${PORT}") &
exec python3 -m http.server ${PORT} --bind 0.0.0.0
