    # B-INSP-01 · AI 检查（Vision + LLM）单次可达 1～3 分钟
    location /api/ {
        proxy_pass http://127.0.0.1:__ZHEJIAN_API_PORT__;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 240s;
        proxy_read_timeout 240s;
    }
