import type {
  BaseCv,
  CreateBaseCvPayload,
  UpdateBaseCvPayload,
} from "@/services/types/base-cv";

export interface IBaseCvService {
  list(): Promise<BaseCv[]>;
  get(id: string): Promise<BaseCv>;
  create(data: CreateBaseCvPayload): Promise<BaseCv>;
  update(id: string, data: UpdateBaseCvPayload): Promise<BaseCv>;
  remove(id: string): Promise<void>;
}
