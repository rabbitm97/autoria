import { createClient } from "@supabase/supabase-js";

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Returns the active prompt for an agent from agent_prompts table.
 * Falls back to the hardcoded string if the table is empty or unreachable.
 */
export async function getAgentPrompt(
  agentName: string,
  fallback: string
): Promise<string> {
  try {
    const { data } = await svcClient()
      .from("agent_prompts")
      .select("prompt_content")
      .eq("agent_name", agentName)
      .eq("is_active", true)
      .limit(1)
      .single();
    return data?.prompt_content ?? fallback;
  } catch {
    return fallback;
  }
}
