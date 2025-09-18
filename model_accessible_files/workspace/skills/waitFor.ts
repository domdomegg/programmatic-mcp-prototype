/**
 * Helper utility for waiting on async conditions
 * Usage: await waitFor(() => someCondition, 500, 30000)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  intervalMs: number = 1000,
  timeoutMs: number = Infinity
): Promise<void> {
  const startTime = Date.now();
  
  while (true) {
    const result = await condition();
    if (result) return;
    
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Retry a function until it succeeds or max attempts reached
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`);
}