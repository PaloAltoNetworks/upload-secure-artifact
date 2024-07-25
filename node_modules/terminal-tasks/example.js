const TaskList = require('./index')

const list = new TaskList(
  ['yarn add terminal-tasks', "new TaskList(['My Task'])", '🌟  on Github!'],
  {
    pendingChar: '→ ',
    ora: { color: 'magenta' }
  }
)

setTimeout(() => {
  list.next()
}, 2000)
setTimeout(() => {
  list.next()
}, 4000)
setTimeout(() => {
  list.message('Hey there, thanks for the star!')
}, 5000)
setTimeout(() => {
  list.next()
}, 6000)
