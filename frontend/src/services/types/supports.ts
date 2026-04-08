export interface Step {
  id: string;
  name: string;
  color: string;
  strict: boolean;
}

export interface Platform {
  id: string;
  name: string;
}

export interface Feedback {
  id: string;
  name: string;
  color: string;
}

export interface Supports {
  steps: Step[];
  platforms: Platform[];
  feedbacks: Feedback[];
}
