const defaultHeaders = {
  username: "cuixujia",
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options?.headers,
    },
  })
  return response.json()
}

export interface AgentScheduleDetail {
  task?: string
  requirement?: string
  currentState?: string
  currentStep?: string
  steps?: WorkflowStep[]
  agents?: AgentInfo[]
  todos?: TodoItem[]
  agentFlow?: AgentFlowItem[]
}

export interface WorkflowStep {
  id: string
  name: string
  mode?: string
  status: "pending" | "in_progress" | "completed"
  startedAt?: string | null
  completedAt?: string | null
  agents?: StepAgent[]
}

export interface StepAgent {
  name: string
  description?: string
  status: "pending" | "in_progress" | "completed"
  dispatchedAt?: string | null
  completedAt?: string | null
}

export interface AgentInfo {
  name: string
  status: "pending" | "in_progress" | "completed"
  description?: string
  dispatchedAt?: string | null
  completedAt?: string | null
}

export interface TodoItem {
  id?: string
  content: string
  status: "pending" | "in_progress" | "completed"
}

export interface AgentFlowItem {
  from: string
  to: string
  title?: string
  timestamp: string
}

interface ApiResponse<T> {
  code: number
  data?: T
  message?: string
}

export async function fetchAgentScheduleDetail(
  codeDirectoryId: string,
  sessionId: string,
): Promise<AgentScheduleDetail | null> {
  const url = `http://localhost:8888/workOrder/agentScheduleDetail?codeDirectoryId=${encodeURIComponent(codeDirectoryId)}&sessionId=${encodeURIComponent(sessionId)}`
  const result = await apiFetch<ApiResponse<AgentScheduleDetail>>(url)
  if (result && result.code === 0 && result.data) {
    return result.data
  }
  return null
}

export async function fetchChildSessionIds(sessionId: string, codeDirectoryId: string): Promise<string[]> {
  const url = `http://localhost:4096/session/${sessionId}/children?directory=${decodeURIComponent(codeDirectoryId)}`
  const result = await apiFetch<ApiResponse<string[]> | string[]>(url)
  if (Array.isArray(result)) {
    return result
  }
  if (result && result.code === 0 && Array.isArray(result.data)) {
    return result.data
  }
  return []
}
