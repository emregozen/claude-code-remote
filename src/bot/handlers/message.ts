import type { Context } from "grammy";

export async function handleMessage(ctx: Context): Promise<void> {
  const prompt = ctx.message?.text;
  if (!prompt) {
    return;
  }
  await ctx.reply(`ok, would run: \`${prompt}\``);
}
