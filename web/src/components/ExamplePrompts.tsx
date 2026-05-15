import { useChatStore } from "../store/chat";

const EXAMPLES: { audience: string; prompt: string }[] = [
  {
    audience: "Shopper",
    prompt: "Find me the best wellness deals in Madrid under 50 euros.",
  },
  {
    audience: "Merchant",
    prompt:
      "I run a spa in Madrid charging 60€ for a 90-min ritual. How does my pricing compare to the wellness segment? Show top performers I should benchmark.",
  },
  {
    audience: "Analyst",
    prompt:
      "Across all Spanish cities, which one has the cheapest beauty deals on average and what discount works best there?",
  },
  {
    audience: "Comparison",
    prompt:
      "Compare these deals for me and pick the best value: acuario-de-zaragoza-2, cine-yelmo-9, serenitee-boutique-spa-3.",
  },
];

export function ExamplePrompts() {
  const send = useChatStore((s) => s.send);
  return (
    <div className="example-prompts">
      {EXAMPLES.map((ex) => (
        <button
          key={ex.audience}
          type="button"
          className="example-prompt"
          onClick={() => void send(ex.prompt)}
        >
          <span className="example-audience">{ex.audience}</span>
          <span className="example-text">{ex.prompt}</span>
        </button>
      ))}
    </div>
  );
}
