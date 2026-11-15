import {
  MathAngledBrackets,
  MathCurlyBrackets,
  MathFraction,
  MathIntegral,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSquareBrackets,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  type MathComponent,
} from "docx";
import { MathNode } from "./mathAst";

const EMPTY = () => [new MathRun(" ")];

/** LaTeX AST → docx 原生公式组件（OMML） */
export function toMathComponents(nodes: MathNode[]): MathComponent[] {
  const out: MathComponent[] = [];

  for (const n of nodes) {
    switch (n.t) {
      case "run": {
        if (!n.text) break;
        const opts: { text: string; normalText?: boolean; style?: "bold"; script?: "doubleStruck" } = { text: n.text };
        if (n.variant === "normal") opts.normalText = true;
        if (n.variant === "bold") opts.style = "bold";
        if (n.variant === "doubleStruck") opts.script = "doubleStruck";
        out.push(new MathRun(opts));
        break;
      }
      case "frac":
        out.push(
          new MathFraction({
            numerator: toMathComponents(n.num).length ? toMathComponents(n.num) : EMPTY(),
            denominator: toMathComponents(n.den).length ? toMathComponents(n.den) : EMPTY(),
          })
        );
        break;
      case "sqrt":
        out.push(
          new MathRadical({
            children: toMathComponents(n.body).length ? toMathComponents(n.body) : EMPTY(),
            degree: n.deg && n.deg.length ? toMathComponents(n.deg) : undefined,
          })
        );
        break;
      case "script": {
        const base = toMathComponents(n.base);
        const baseSafe = base.length ? base : EMPTY();
        const sub = n.sub ? toMathComponents(n.sub) : undefined;
        const sup = n.sup ? toMathComponents(n.sup) : undefined;
        if (sub && sup) {
          out.push(new MathSubSuperScript({ children: baseSafe, subScript: sub.length ? sub : EMPTY(), superScript: sup.length ? sup : EMPTY() }));
        } else if (sup) {
          out.push(new MathSuperScript({ children: baseSafe, superScript: sup.length ? sup : EMPTY() }));
        } else if (sub) {
          out.push(new MathSubScript({ children: baseSafe, subScript: sub.length ? sub : EMPTY() }));
        } else {
          out.push(...baseSafe);
        }
        break;
      }
      case "op": {
        const body = toMathComponents(n.body);
        const bodySafe = body.length ? body : EMPTY();
        const sub = n.sub ? toMathComponents(n.sub) : undefined;
        const sup = n.sup ? toMathComponents(n.sup) : undefined;
        if (n.symbol === "∫" || n.symbol === "∬" || n.symbol === "∭" || n.symbol === "∮") {
          out.push(
            new MathIntegral({
              children: bodySafe,
              subScript: sub,
              superScript: sup,
              limits: n.limits,
            })
          );
        } else {
          out.push(
            new MathSum({
              children: bodySafe,
              subScript: sub,
              superScript: sup,
              limits: n.limits,
            })
          );
        }
        break;
      }
      case "delim": {
        const body = toMathComponents(n.body);
        const bodySafe = body.length ? body : EMPTY();
        if (n.open === "(" || n.open === "") out.push(new MathRoundBrackets({ children: bodySafe }));
        else if (n.open === "[") out.push(new MathSquareBrackets({ children: bodySafe }));
        else if (n.open === "{") out.push(new MathCurlyBrackets({ children: bodySafe }));
        else if (n.open === "⟨") out.push(new MathAngledBrackets({ children: bodySafe }));
        else {
          // 其它括号（| ‖ 等）降级为普通文字包一层
          out.push(new MathRun(n.open));
          out.push(...bodySafe);
          if (n.close) out.push(new MathRun(n.close));
        }
        break;
      }
      default:
        break;
    }
  }

  return out;
}
