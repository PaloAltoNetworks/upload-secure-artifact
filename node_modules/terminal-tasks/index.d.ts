import OraOptions from './ora'

interface Task {
  /**
   * Text to show next to spinner
   */
  name: string
  /**
   * Options to pass to Ora for this task
   */
  ora?: OraOptions
}
declare interface Options {
  /**
   * Character to show in front of pending tasks, defaults to "- "
   */
  pendingChar: string
  /**
   * Character to show in front of messages, defaults to "  > "
   */
  messageChar: string
  /**
   * Hide all messages when .next() is called, defaults to false
   */
  collapse: boolean
  /**
   * Options to pass to Ora for this task
   */
  ora?: OraOptions
}

declare class TaskList {
  constructor(tasks?: (string | Task)[], options?: Options)
  /**
   * Pass the current task and start spinner on the next
   * @param message Text to show on pass, defaults to task name
   */
  next(message?: string)
  /**
   * Pass the current task with warn icon and start spinner on the next
   * @param message Text to show on pass, defaults to task name
   */
  warn(message?: string)
  /**
   * Pass the current task with info icon and start spinner on the next
   * @param message Text to show on pass, defaults to task name
   */
  info(message?: string)
  /**
   * Fail current task
   * @param message Text to show on failure, defaults to task name
   */
  fail(message?: string)
  /**
   * Add a task or array of tasks to list
   * @param task Name of task or task object (optionally in an array) to add
   */
  add(task: string | Task | (string | Task)[])
  /**
   * Run .next() for each remaining task
   * @param message Message to log to console after completion
   */
  complete(message?: string)
  /**
   * Display a message indented under the current task
   * @param message Message to display
   */
  message(message: string)
  /**
   * Re-display list
   */
  showList()
}

export = TaskList
