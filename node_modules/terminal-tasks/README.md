# Terminal Tasks [![CircleCI](https://circleci.com/gh/nklayman/terminal-tasks.svg?style=svg)](https://circleci.com/gh/nklayman/terminal-tasks)

> A simple terminal task list powered by [Ora](https://github.com/sindresorhus/ora).

<p align="center">
	<br>
    <img width="600" src="https://raw.githubusercontent.com/nklayman/terminal-tasks/master/example.svg?sanitize=true">
	<br>
</p>

## Install

With Yarn

```shell
yarn add terminal-tasks
```

or with NPM

```shell
npm install terminal-tasks
```

## Usage

```javascript
const TaskList = require('terminal-tasks')

const list = new TaskList(['First Task', 'Second Task'])

someTask().then(() => {
  // Move to next task
  list.next()
})
```

## API

### new TaskList(tasks, options)

#### tasks

type: `array`

Array of tasks. Tasks can be a string (alias for `name`) or a task object.

#### task object

```javascript
{
  name: 'text to display next to spinner',
  ora: {} // ora options for the spinner (optional)
}
```

See [ora options](https://github.com/sindresorhus/ora/blob/master/readme.md#api)

#### options

type: `object` (optional)

```javascript
{
  // Character to show in front of pending tasks
  // Should be 2 chars long
  pendingChar: '- ',
  // Character to show in front of messages
  // Should have 2 spaces in front and 1 space after (4 chars total)
  messageChar: '  > ',
  // Hide messages when .next() is called
  collapse: false,
  // ora options to set for every task
  ora: {}
}
```

### Instance

#### .next(message)

Set current task status to `succeed` and start spinner on next task. Optionally takes a `message` argument which will show instead of the task name.

#### .info(message)

Set current task status to `info` and start spinner on next task. Optionally takes a `message` argument which will show instead of the task name.

#### .warn(message)

Set current task status to `warn` and start spinner on next task. Optionally takes a `message` argument which will show instead of the task name.

#### .fail(message)

Fail the current task and display it's name or the `message` argument. Will not start the next task.

#### .add(task)

Add a task to the list. Can be a string or task object.

#### .complete(message)

Run .next() for each remaining task. Optionally takes a message argument which will be logged to console.

#### .message(message)

Display an indented message below the current task. Will show when .next() is called unless `collapse` is set to `true` in options.
