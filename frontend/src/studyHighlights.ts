import type { PlanStep } from './api'

export type MoveEventLabel = 'capture' | 'check' | 'fork' | 'key'

const LABEL_TEXT: Record<MoveEventLabel, string> = {
  capture: 'Capture',
  check: 'Check',
  fork: 'Fork',
  key: 'Key',
}

export function moveEventLabelText(label: MoveEventLabel): string {
  return LABEL_TEXT[label]
}

export function stepEventLabels(step: PlanStep): MoveEventLabel[] {
  if (step.labels?.length) {
    return step.labels.filter((l): l is MoveEventLabel => l in LABEL_TEXT)
  }
  const labels: MoveEventLabel[] = []
  if (step.is_capture) labels.push('capture')
  if (step.is_check) labels.push('check')
  if (step.events.some((e) => e.type === 'fork')) labels.push('fork')
  return labels
}

/** planStep indices (0 = start, 1+ = moves) worth jumping to in highlight mode. */
export function highlightPlanSteps(
  steps: PlanStep[],
  highlightPlies: number[] | undefined,
): number[] {
  const plySet = new Set(highlightPlies ?? [])
  const indices = [0]
  steps.forEach((s, i) => {
    const labels = stepEventLabels(s)
    const noteworthy =
      plySet.has(s.ply) ||
      labels.some((l) => l === 'capture' || l === 'check' || l === 'fork') ||
      labels.includes('key')
    if (noteworthy) {
      indices.push(i + 1)
    }
  })
  return [...new Set(indices)].sort((a, b) => a - b)
}

export function nextHighlightStep(
  current: number,
  highlightSteps: number[],
): number {
  if (!highlightSteps.length) return current
  const next = highlightSteps.find((s) => s > current)
  return next ?? highlightSteps[highlightSteps.length - 1]!
}

export function prevHighlightStep(
  current: number,
  highlightSteps: number[],
): number {
  if (!highlightSteps.length) return current
  const prev = [...highlightSteps].reverse().find((s) => s < current)
  return prev ?? highlightSteps[0]!
}
