import { statusTone } from "../model";

interface Props {
  status: string | null | undefined;
  statuses: string[];
}

/** A lifecycle status, coloured by its position in the class's status list. */
export function StatusChip({ status, statuses }: Props) {
  if (!status) return null;
  return <span className={`chip tone-${statusTone(statuses, status)}`}>{status}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}
