/**
 * BarkSDK — actionCycle (replaces tool loop / _run_openai_compatible_loop)
 *
 * Multi-turn agentic loop that alternates between:
 *   provider stream → execute requested actions → feed results back → repeat
 *
 * Maximum rounds prevent runaway tool loops.
 */

import { TurnSummary } from "../protocol/packets.mjs";
import { computeCharge } from "../pricing/table.mjs";

const MAX_ROUNDS = 25;

/**
 * Run the action cycle.
 *
 * @param {Function} providerRunner — async (cfg, signal, onEvent, messages, tools) => TurnSummary
 * @param {import("../core/config.mjs").BarkConfig} cfg
 * @param {AbortSignal} signal
 * @param {function} onEvent — wire event dispatcher
 * @param {Array} messages — OpenAI-format message history
 * @param {object} actionHub — { tools: Array, dispatch: Function }
 * @returns {Promise<TurnSummary>}
 */
export async function actionCycle(providerRunner, cfg, signal, onEvent, messages, actionHub) {
  let totalIn = 0, totalOut = 0, totalCache = 0;
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    if (signal.aborted) {
      return new TurnSummary({ ok: false, fault: "aborted", tokensIn: totalIn, tokensOut: totalOut, rounds });
    }
    rounds++;

    // --- Provider streaming turn ---
    const result = await providerRunner(cfg, signal, onEvent, messages, actionHub.tools);

    totalIn += result.tokensIn;
    totalOut += result.tokensOut;
    totalCache += result.tokensCache;

    if (!result.ok) {
      return new TurnSummary({
        ok: false,
        fault: result.fault,
        tokensIn: totalIn,
        tokensOut: totalOut,
        tokensCache: totalCache,
        rounds,
      });
    }

    // Check whether the model requested any actions (tool_calls) by looking
    // at the last assistant message in the history, or checking if onEvent
    // received any "action" events. Since the provider runner already pushes
    // to the message array, we check the last assistant message.
    const lastAssistant = findLastAssistantMsg(messages);
    const hasToolCalls = lastAssistant && lastAssistant.tool_calls && lastAssistant.tool_calls.length > 0;

    if (!hasToolCalls) {
      // No tool calls → turn is complete
      break;
    }

    // --- Execute requested actions ---
    for (const tc of lastAssistant.tool_calls) {
      if (signal.aborted) {
        return new TurnSummary({ ok: false, fault: "aborted", tokensIn: totalIn, tokensOut: totalOut, rounds });
      }

      let parsedArgs;
      try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { parsedArgs = {}; }

      onEvent("action", {
        ref: tc.id,
        label: tc.function.name,
        params: parsedArgs,
      });

      const { outcome, failed } = await actionHub.dispatch(tc.function.name, parsedArgs);

      onEvent("outcome", { ref: tc.id, outcome, failed });

      // Push tool result to message history
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: outcome,
      });
    }
  }

  if (rounds >= MAX_ROUNDS) {
    return new TurnSummary({
      ok: false,
      fault: `Action cycle hit max rounds (${MAX_ROUNDS})`,
      tokensIn: totalIn,
      tokensOut: totalOut,
      tokensCache: totalCache,
      rounds,
    });
  }

  const charge = computeCharge(cfg.channel, cfg.variant, totalIn, totalOut, totalCache);

  return new TurnSummary({
    ok: true,
    tokensIn: totalIn,
    tokensOut: totalOut,
    tokensCache: totalCache,
    charge,
    rounds,
  });
}


function findLastAssistantMsg(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i];
  }
  return null;
}
