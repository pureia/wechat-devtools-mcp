# MCP 传输采用 stdio

MCP 服务器使用标准输入输出（stdio）作为传输层，而非 SSE/HTTP。

本服务器是「本地」MCP 服务器：由 MCP 客户端（如 Claude Desktop、Cursor、Trae）以子进程方式拉起，stdio 无需监听端口、无网络暴露面，配置最简单。若未来需要远程或多客户端并发访问，可再引入 SSE，但当前无此需求。
