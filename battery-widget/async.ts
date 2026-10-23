// 有界异步操作，不阻塞初始界面；完成后移除超时计时器。
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}超时`)), ms)
    })])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}
