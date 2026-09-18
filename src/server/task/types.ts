export interface TaskExecutionResult {
  taskId: string
  timestamp: number
  success: boolean
  message: string
  details?: any
}

export interface ScheduledTask {
  id: string
  name: string
  intervalMs: number
  enabled: boolean
  lastRunTime?: number
  nextRunTime?: number
  isRunning: boolean
  lastResult?: TaskExecutionResult
  run: () => Promise<TaskExecutionResult>
}
