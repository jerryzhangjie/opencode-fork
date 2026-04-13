import { For, Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"

export type StepAgent = {
  name: string
  description?: string
  status: "pending" | "in_progress" | "completed"
  dispatchedAt?: string | null
  completedAt?: string | null
}

export type WorkflowStep = {
  id: string
  name: string
  mode?: string
  status: "pending" | "in_progress" | "completed"
  startedAt?: string | null
  completedAt?: string | null
  agents?: StepAgent[]
}

export type AgentInfo = {
  name: string
  status: "pending" | "in_progress" | "completed"
  description?: string
  dispatchedAt?: string | null
  completedAt?: string | null
}

export type TodoItem = {
  id?: string
  content: string
  status: "pending" | "in_progress" | "completed"
}

export type AgentFlowItem = {
  from: string
  to: string
  title?: string
  timestamp: string
}

export type AgentConfig = Record<
  string,
  {
    label?: string
    icon?: string
  }
>

export type TaskInfo = {
  id?: string
  name?: string
  status?: string
  statusLabel?: string
  heartbeat?: "active" | "stalled"
  heartbeatLabel?: string
}

export type AgentScheduleDetail = {
  task?: string
  requirement?: string
  currentState?: string
  currentStep?: string
  steps?: WorkflowStep[]
  agents?: AgentInfo[]
  todos?: TodoItem[]
  agentFlow?: AgentFlowItem[]
}

export type TaskProgressPanelProps = {
  selectedTask: () => TaskInfo | null
  scheduleDetail: () => AgentScheduleDetail
  agentConfig: () => AgentConfig
  class?: string
}

const formatShortTime = (timeStr?: string) => {
  if (!timeStr) return "-"
  const date = new Date(timeStr)
  if (isNaN(date.getTime())) return timeStr
  return date.toLocaleTimeString("zh-CN", { hour12: false }).slice(0, 5)
}

const getAgentLabel = (key: string, config: AgentConfig) => {
  return config[key]?.label || key
}

const getAgentIcon = (key: string, config: AgentConfig) => {
  return config[key]?.icon || config["default"]?.icon || "🤖"
}

const getAgentStatusClass = (status: string) => {
  if (status === "completed") return "spf-completed"
  if (status === "in_progress") return "spf-active"
  return "spf-pending"
}

const getTodoStatusLabel = (status: string) => {
  const map: Record<string, string> = { completed: "完成", in_progress: "进行中", pending: "待办" }
  return map[status] || status
}

export function TaskProgressPanel(props: TaskProgressPanelProps) {
  // 🔑 核心修改：动态注入项目经理智能体
  const allAgents = createMemo(() => {
    const detail = props.scheduleDetail()
    const steps = detail.steps || []

    // 1. 收集原有步骤中的真实智能体
    const stepAgents = steps.flatMap((s) => s.agents || [])
    const directAgents = detail.agents || []
    const combined: AgentInfo[] = [...stepAgents, ...directAgents]

    // 2. 匹配 primary / user_gate 模式，注入项目经理
    const pmSteps = steps.filter((s) => s.mode === "primary" || s.mode === "user_gate")
    if (pmSteps.length > 0) {
      // 🔑 状态逻辑更新：只要有一个 in_progress 就取；若没有，则从 completed 中任取一个
      const targetStep =
        pmSteps.find((s) => s.status === "in_progress") || pmSteps.find((s) => s.status === "completed") || pmSteps[0] // 安全兜底：处理全为 pending 或混合状态的边界情况
      if (targetStep) {
        combined.unshift({
          name: "project-manager",
          status: targetStep.status,
          description: targetStep.name, // 描述复用步骤名称，便于悬停提示
          dispatchedAt: targetStep.startedAt,
          completedAt: targetStep.completedAt,
        })
      }
    }

    // 3. 按 name 去重（unshift 保证了项目经理排在最前）
    const uniqueMap = new Map<string, AgentInfo>()
    for (const agent of combined) {
      if (!uniqueMap.has(agent.name)) {
        uniqueMap.set(agent.name, agent)
      }
    }
    return Array.from(uniqueMap.values())
  })

  const todosFromSteps = createMemo(() => {
    const steps = props.scheduleDetail().steps || []
    // 过滤掉空占位对象（id 或 name 为空则视为无效数据）
    return steps
      .filter((step) => step.id && step.name)
      .map((step) => ({
        id: step.id,
        content: step.name,
        status: step.status as "pending" | "in_progress" | "completed",
      }))
  })
  const filteredAgentFlow = createMemo(() => {
    const flows = props.scheduleDetail().agentFlow || []
    // 过滤掉 from/to 为空或纯空格的无效记录
    return flows.filter((flow) => flow.from?.trim() && flow.to?.trim() && flow.timestamp)
  })

  const todoPercent = createMemo(() => {
    const todos = todosFromSteps()
    if (todos.length === 0) return 0
    const completed = todos.filter((t) => t.status === "completed").length
    return Math.round((completed / todos.length) * 100)
  })

  const todoCompletedCount = createMemo(() => {
    const todos = todosFromSteps()
    return todos.filter((t) => t.status === "completed").length
  })

  return (
    <div class={`sd-panel sd-progress ${props.class || ""}`}>
      <div class="sd-progress-header">
        <span>📊 任务进展</span>
        <Show when={props.selectedTask()?.heartbeat}>
          <span class={`hb ${props.selectedTask()?.heartbeat}`}>{props.selectedTask()?.heartbeatLabel}</span>
        </Show>
      </div>
      <div class="sd-progress-list">
        <Show
          when={props.selectedTask() && props.scheduleDetail().steps?.length}
          fallback={<div class="sp-empty">暂无任务进展</div>}
        >
          <div class="sp-detail">
            {/* <div class="spd-header">
              <span class="spd-id">{props.selectedTask()?.id}</span>
              <span class={`tag st-${props.selectedTask()?.status}`}>{props.selectedTask()?.statusLabel}</span>
            </div> */}
            <h3 class="spd-title">{props.scheduleDetail().task}</h3>

            <Show when={allAgents().length}>
              <div class="spd-section">
                <div class="spdt-header">执行阶段</div>
                <div class="spd-agents-flow-wrapper">
                  <div class="spd-agents-flow">
                    <For each={allAgents()}>
                      {(agent) => (
                        <div
                          class={`spf-item ${getAgentStatusClass(agent.status)}`}
                          title={getAgentLabel(agent.name, props.agentConfig())}
                        >
                          <div class="spf-icon-wrapper">
                            <span class="spf-icon">{getAgentIcon(agent.name, props.agentConfig())}</span>
                          </div>
                          <div class="spf-name">{getAgentLabel(agent.name, props.agentConfig())}</div>
                          <span class={`spf-status-dot ${agent.status}`} />
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={todosFromSteps().length}>
              <div class="spd-section">
                <div class="spdt-header">
                  <span>
                    待办事项
                    <span>
                      ({todoCompletedCount()}/{todosFromSteps().length})
                    </span>
                  </span>
                  <span class="spdt-percent">{todoPercent()}%</span>
                </div>
                <div class="spdt-bar-container">
                  <div class="spdt-bar">
                    <div class="spdt-fill" style={{ width: `${todoPercent()}%` }} />
                  </div>
                </div>
                <div class="spdt-list">
                  <For each={todosFromSteps()}>
                    {(todo) => {
                      const stepAgents = createMemo(() => {
                        const steps = props.scheduleDetail().steps || []
                        const step = steps.find((s) => s.id === todo.id)
                        return step?.agents || []
                      })
                      const activeAgent = createMemo(() => stepAgents().find((a) => a.status === "in_progress"))
                      const isInProgress = todo.status === "in_progress"
                      const [expanded, setExpanded] = createSignal(isInProgress)

                      return (
                        <div class={`spdt-item ${todo.status === "completed" ? "done" : ""}`}>
                          <div class="spdti-main" onClick={() => isInProgress && setExpanded(!expanded())}>
                            <span class="spdti-icon">
                              {todo.status === "completed" ? "✅" : todo.status === "in_progress" ? "⏳" : "⚪"}
                            </span>
                            <span class="spdti-title">{todo.content}</span>
                            <span class={`spdti-status tag st-${todo.status}`}>{getTodoStatusLabel(todo.status)}</span>
                          </div>
                          <Show when={isInProgress && expanded() && activeAgent()}>
                            <div class="spdti-collapse">
                              <div class="spdti-collapse-content">
                                <div class="spcd-row">
                                  <span class="spcd-label">🚀 当前执行：</span>
                                  <span class="spcd-value">
                                    {getAgentLabel(activeAgent()!.name, props.agentConfig())} -{" "}
                                    {activeAgent()?.description || "-"}
                                  </span>
                                </div>
                                <div class="spcd-row">
                                  <span class="spcd-label">开始时间：</span>
                                  <span class="spcd-value">
                                    {activeAgent()?.dispatchedAt ? (activeAgent()?.dispatchedAt ?? null) : "-"}
                                  </span>
                                </div>
                                <div class="spcd-row">
                                  <span class="spcd-label">完成时间：</span>
                                  <span class="spcd-value">
                                    {activeAgent()?.completedAt ? (activeAgent()?.completedAt ?? null) : "-"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Show>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={filteredAgentFlow().length}>
              <div class="spd-section">
                <div class="spdt-header">流转日志</div>
                <div class="spd-flow-list-centered">
                  <For each={filteredAgentFlow()}>
                    {(flow) => (
                      <div class="spdtr-item-centered">
                        <span class="spdtr-time">{formatShortTime(flow.timestamp)}</span>
                        <span class="spdtr-from">{getAgentLabel(flow.from, props.agentConfig())}</span>
                        <Icon name="arrow-right" class="spdtr-arrow" />
                        <span class="spdtr-to">{getAgentLabel(flow.to, props.agentConfig())}</span>
                        <span class="spdtr-title">{flow.title}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
