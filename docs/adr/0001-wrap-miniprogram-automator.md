# 选用官方 miniprogram-automator 作为自动化 SDK

封装 SDK 时，选择了微信官方 npm 包 miniprogram-automator，而不是自研对接开发者工具内部 HTTP/WebSocket 服务，也不是用仅面向 CI 的 miniprogram-ci。

官方包为 Program / Page / Element 提供了稳定的高层 API，且随开发者工具版本维护；自研对接能获得最大控制力，但依赖工具内部协议，脆弱且工作量大。工具集全部建立在 automator 之上，此选择一旦定下难以逆转。
