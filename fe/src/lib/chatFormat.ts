import type { Task } from '@/lib/types'

export function tasksToNumberedList(tasks: Task[]) {
  return [...tasks]
    .sort((a, b) => a.order - b.order)
    .map((t, i) => `${i + 1}. ${t.title}`)
    .join('\n')
}
