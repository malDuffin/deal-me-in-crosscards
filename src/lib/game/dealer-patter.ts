import type { Difficulty } from "./types";

export type DealStage = {
  id: string;
  label: string;
  line: string;
};

export const DEAL_STAGES: DealStage[] = [
  {
    id: "felt",
    label: "Brush the felt",
    line: "Brushing the felt. Last night someone cried on the ten of clubs. It still thinks it's a tragedy.",
  },
  {
    id: "cut",
    label: "Cut the deck",
    line: "Cutting the deck. The Queen of Spades asked to go first. We told her everyone is equal. She laughed in French.",
  },
  {
    id: "riffle",
    label: "Riffle twice",
    line: "Riffle one: honest. Riffle two: still honest, just more dramatic. Cards love an audience.",
  },
  {
    id: "gold",
    label: "Mark gold seats",
    line: "Painting the gold seats. These are not suggestions. These are tiny thrones. Sit the right card or the throne bites.",
  },
  {
    id: "stop",
    label: "Plant the stops",
    line: "Planting Stop cards. They're bouncers. They don't move, they don't bluff, they don't care about your straight.",
  },
  {
    id: "fixed",
    label: "Seat the regulars",
    line: "Seating the regulars — the cards that already live here. Do not ask them to scoot. They have a mortgage on that square.",
  },
  {
    id: "hand",
    label: "Deal your tray",
    line: "Dealing your tray, ace-high, because the Ace wrote a strongly worded letter. The two of diamonds is sulking at the back.",
  },
  {
    id: "lights",
    label: "Light the rail",
    line: "Lighting the rail. Chips away from the cards. Elbows in. If a jack winks at you, that is not a hint. That is a personality.",
  },
];

export const DEAL_STALL: string[] = [
  "Hold please — the Ace of Diamonds is still signing autographs on the underside of the felt.",
  "The two of clubs filed a seating complaint. We're pretending to read it.",
  "Counting to fifty-two. Got fifty-one. Found the last one in the dealer's sleeve. Joke. House rules. Probably.",
  "The Queen says she is not a face card, she is a lifestyle. Noted. Moving on.",
  "Probability asked for a recount. We told it this is a crossword now. It sat down, confused and a little into it.",
  "Checking under the felt for extra kings. Clean. The kings are exactly as lonely as they should be.",
  "Someone's tell is the ten of hearts. We're rotating it 3 degrees so it looks innocent.",
  "Riffle twelve. House rule: never deal on thirteen. Thirteen is how jokers get ideas.",
  "The river asked for a glass of water. We explained there is no river, only rows. Awkward for everyone.",
  "A pair of eights is whispering. That's allowed. Collusion with yourself is just confidence.",
  "Gold paint drying. If you sit too early the throne stays on your trousers. Ask the five of spades.",
  "The dealer is arguing with luck. Luck brought a lawyer. We're stalling until the lawyer gets bored.",
  "Shuffling slower so the cards can think about their life choices. The three of diamonds chose chaos. Again.",
  "Straightening a stop card. It was already straight. It just likes attention.",
  "Almost. One jack is still in the bathroom. Face cards, I swear.",
];

export const DEAL_OPENERS: Record<Difficulty, string> = {
  easy: "Easy table. Friendly cards. They still lie, just politely.",
  medium: "Medium table. Mixed company. A straight might show up wearing a hat.",
  hard: "Hard table. Crowded crossword. If you hear a full house breathing, that's normal.",
  expert: "Expert table. Packed felt. The cards have unionized. Good luck at the bargaining table.",
};

export function stallLine(i: number): string {
  return DEAL_STALL[i % DEAL_STALL.length];
}
