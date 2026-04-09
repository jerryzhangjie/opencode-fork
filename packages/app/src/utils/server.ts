import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { ServerConnection } from "@/context/server"

export function createSdkForServer({
  server,
  ...config
}: Omit<NonNullable<Parameters<typeof createOpencodeClient>[0]>, "baseUrl"> & {
  server: ServerConnection.HttpBase
}) {
  const auth = (() => {
    if (!server.password) return
    return {
      Authorization: `Basic ${btoa(`${server.username ?? "opencode"}:${server.password}`)}`,
    }
  })()

  // 构建产物中，接口路径带有前缀 /ai-hci-api，开发环境中为根路径
  const baseUrl = import.meta.env.DEV
    ? server.url
    : server.url.replace(/\/$/, "") + "/ai-hci-api"
  
  return createOpencodeClient({
    ...config,
    headers: { ...config.headers, ...auth },
    baseUrl,
  })
}
