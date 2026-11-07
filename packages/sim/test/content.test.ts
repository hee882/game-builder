import { describe, expect, it } from 'vitest';
import { CONTENT, NODES, validateContent } from '../src/index';

describe('30Hz 원천 데이터',()=>{
  it('14노드, 클립 16개, 예고 리드타임 C2와 정수 틱을 검증한다',()=>{
    expect(validateContent()).toEqual([]);
    expect(NODES.flatMap(node=>node.clips)).toHaveLength(16);
  });
  it('튕겨내기 5틱 미만 데이터는 거부한다',()=>{
    const invalid=structuredClone(CONTENT); invalid.timing.parry=[0,4];
    expect(validateContent(invalid)).toContain('튕겨내기 최소 5틱');
  });
  it('짧은 텔레그래프와 깨진 간선을 거부한다',()=>{
    const invalid=structuredClone(CONTENT);
    invalid.enemyAttacks[0]!.lead=11;
    invalid.nodes[0]!.edges[0]!.to='missing';
    expect(validateContent(invalid)).toContain('reed_slash: 예고 최소치');
    expect(validateContent(invalid)).toContain('hw_l1: 없는 간선 missing');
  });
});
