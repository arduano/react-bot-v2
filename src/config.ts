import z from "zod";

const reactConfigSchema = z.object({
  channel: z.string(),
  message: z.string(),
  reactMap: z.record(z.string()),
});
export type ReactConfig = z.infer<typeof reactConfigSchema>;

const reactConfigArraySchema = z.array(reactConfigSchema);

export async function readConfig() {
  const configFile = await Bun.file("config.json");
  const config = await configFile.json();

  const parsedConfig = reactConfigArraySchema.parse(config);

  return parsedConfig;
}
