// In-memory storage for tasks
// In production, this would be stored in a database

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "waiting_client" | "on_hold" | "completed_month" | "done";
  assignee?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

let tasks: Task[] = [
  {
    id: "1",
    title: "עיצוב ממשק משתמש חדש",
    description: "לעצב את הממשק החדש ללקוח",
    status: "todo",
    assignee: "אופק",
    priority: "high",
    tags: ["עיצוב", "דחוף"],
    dueDate: "2025-11-25",
    createdAt: "2025-11-20T10:00:00Z",
    updatedAt: "2025-11-20T10:00:00Z",
  },
  {
    id: "2",
    title: "פיתוח API למערכת",
    description: "לבנות API endpoints חדשים",
    status: "in_progress",
    assignee: "דני",
    priority: "high",
    tags: ["פיתוח", "backend"],
    dueDate: "2025-11-23",
    createdAt: "2025-11-19T14:30:00Z",
    updatedAt: "2025-11-21T09:15:00Z",
  },
  {
    id: "3",
    title: "בדיקות איכות",
    description: "לבצע בדיקות QA למערכת החדשה",
    status: "waiting_client",
    assignee: "שרה",
    priority: "medium",
    tags: ["QA", "בדיקות"],
    createdAt: "2025-11-18T11:00:00Z",
    updatedAt: "2025-11-20T16:45:00Z",
  },
  {
    id: "4",
    title: "שדרוג שרתים",
    description: "עדכון גרסאות השרתים",
    status: "completed_month",
    assignee: "מיכאל",
    priority: "low",
    tags: ["DevOps", "תחזוקה"],
    createdAt: "2025-11-15T08:00:00Z",
    updatedAt: "2025-11-18T14:20:00Z",
  },
];

export const tasksStorage = {
  getAll: (): Task[] => {
    return tasks;
  },

  getById: (id: string): Task | undefined => {
    return tasks.find((task) => task.id === id);
  },

  create: (task: Omit<Task, "id" | "createdAt" | "updatedAt">): Task => {
    const newTask: Task = {
      ...task,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    return newTask;
  },

  update: (id: string, updates: Partial<Task>): Task | null => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return null;

    tasks[index] = {
      ...tasks[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return tasks[index];
  },

  delete: (id: string): boolean => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;

    tasks.splice(index, 1);
    return true;
  },
};
