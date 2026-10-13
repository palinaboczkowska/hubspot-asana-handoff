import { z } from "zod";

export const HandoffTemplateSchema = z.object({
  tasks: z.array(
    z.object({
      name: z.string(),
      /** Days after the deal's close date. Omit for no due date. */
      dueInDays: z.number().optional(),
      /** "salesOwner" assigns the task to the person who won the deal. */
      assignTo: z.enum(["salesOwner"]).optional(),
    }),
  ),
});
export type HandoffTemplate = z.infer<typeof HandoffTemplateSchema>;

export function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
