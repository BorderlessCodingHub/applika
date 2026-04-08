export interface Cycle {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
}

export interface CreateCyclePayload {
  name: string;
}
