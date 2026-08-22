import type { CSSProperties, Ref } from "react";

type PlayingCardElement = HTMLElement & {
  cid?: string;
  cardcolor?: string;
  suitcolor?: string;
  rankcolor?: string;
};

type PlayingCardProps = {
  cid?: string;
  rank?: string;
  suit?: string;
  cardcolor?: string;
  suitcolor?: string;
  rankcolor?: string;
  opacity?: string;
  shadow?: string;
  borderradius?: string;
  bordercolor?: string;
  borderline?: string;
  class?: string;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<PlayingCardElement>;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "playing-card": PlayingCardProps;
    }
  }
}

export {};
