export interface CstToken {
  image: string;
  tokenType: {
    name: string;
  };
  startOffset: number;
}

export interface CstNode {
  name: string;
  children: Record<string, (CstNode | CstToken)[]>;
}

export interface ParseResult {
  isSuccess: boolean;
  cst?: CstNode;
  errors?: unknown[];
}
