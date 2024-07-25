const ora = require('ora')

module.exports = class terminalTasks {
  constructor (tasks, options) {
    if (!tasks) tasks = []
    if (!options) options = {}
    tasks.forEach((task, index) => {
      // Covert all tasks to objects
      task = makeTask(task, index === 0 /* Status should be running */)
      tasks.splice(index, 1, task)
    })

    this.tasks = tasks

    if (!options.pendingChar) options.pendingChar = '- '
    if (!options.messageChar) options.messageChar = '  > '
    this.options = options
    if (this.tasks.length > 0) this.showList()
  }
  showList () {
    const text = this.tasks
      .map(task => this.taskText(task))
      .join(`\n${this.options.pendingChar}`)
    this.spinner = ora({
      text,
      ...(this.options.ora || {}),
      ...(this.tasks[0].ora || {})
    }).start()
  }
  nextTask (method, message) {
    if (this.tasks.length === 0) {
      throw new Error(
        `You called ".${
          method === 'succeed' ? 'next' : method
        }()" on a task list which did not have a current task`
      )
    }
    const task = this.tasks[0]
    // Show messages if collapse is false
    const completeText =
      message || (this.options.collapse ? task.name : this.taskText(task))
    this.spinner[method](completeText)
    this.tasks.splice(0, 1)
    if (this.tasks.length > 0) {
      // Start next spinner if there are tasks left
      this.showList()
    }
  }
  next (message) {
    this.nextTask('succeed', message)
  }
  warn (message) {
    this.nextTask('warn', message)
  }
  info (message) {
    this.nextTask('info', message)
  }
  add (task) {
    if (Array.isArray(task)) {
      task.forEach(taskItem => {
        this.tasks.push(makeTask(taskItem))
      })
    } else {
      this.tasks.push(makeTask(task))
    }
    if (this.spinner && this.spinner.stop) {
      // Hide old spinner if it exists
      this.spinner.stop()
    }
    // Show task
    this.showList()
  }
  fail (message) {
    this.spinner.fail(message || this.tasks[0].name)
  }
  complete (message) {
    Array.from(Array(this.tasks.length)).forEach(() => {
      this.next()
    })
    if (message) {
      console.log(message)
    }
  }
  message (message) {
    const task = this.tasks[0]
    if (!task) {
      throw new Error(
        'You called ".message()" on a task list which did not have a current task'
      )
    }
    if (!task.messages) {
      task.messages = []
    }
    task.messages.push(message)
    if (this.spinner && this.spinner.stop) {
      // Hide old spinner if it exists
      this.spinner.stop()
    }
    this.showList()
  }
  taskText ({ name, messages }) {
    let messageText = ''
    if (messages) {
      // So that message char is added to first message
      messages.splice(0, 0, '')
      messageText = messages.join(`\n${this.options.messageChar}`)
      // Remove empty first item
      messages.splice(0, 1)
    }
    return name + messageText
  }
}

function makeTask (task, running) {
  if (typeof task === 'string') {
    task = { name: task }
  }
  if (!task.status) {
    task.status = running ? 'running' : 'pending'
  }
  return task
}
