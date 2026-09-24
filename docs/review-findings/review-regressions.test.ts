import { describe, it, expect } from 'vitest';
import sample from '../docs/reference/sample-document.json';
import { normalize } from './normalize';
import { runChecks, claimable } from './checks';
import { bahtText } from './baht-text';
import { isIsoDate } from './thai-tax';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const doc = () => normalize(structuredClone(sample));
describe('independent review reproductions', () => {
  it('Thai words match prototype across seeded and million-group boundaries', () => {
    const html=readFileSync('docs/reference/prototype-ledger.html','utf8');
    const code=html.slice(html.indexOf('function thaiInt('),html.indexOf('function addDays('));
    const context=vm.createContext({}); vm.runInContext(code,context);
    const original=(context as {bahtText:(n:number)=>string}).bahtText;
    const values=[0,0.01,0.5,0.99,1,11,21,101,1000000,1000001,1000011,1000101,1000000000000,1000000000001];
    let seed=12345;
    for(let i=0;i<10000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0; values.push(seed/100);}
    for(const n of values) expect(bahtText(n)).toBe(original(n));
  });
  it('invalid month crashes checks', () => {
    const d=doc(); d.date='2026-13-23';
    expect(isIsoDate(d.date)).toBe(true);
    expect(() => runChecks(d)).toThrow(RangeError);
  });
  it('February 30 is reported valid', () => {
    const d=doc(); d.date='2026-02-30'; d.creditDays=0;
    expect(runChecks(d).find(c=>c.key==='date')?.ok).toBe(true);
  });
  it('quantity precision is lost', () => {
    const d=doc(); d.items[0].qty=1.234; d.items[0].price=1000; d.items[0].amount=1234; d.totals.total=1234;
    const n=normalize(d);
    expect(n.items[0].qty).toBe(1.23);
    expect(runChecks(n).find(c=>c.key==='items')?.ok).toBe(false);
  });
  it('zero price bypasses multiplication', () => {
    const d=doc(); d.items[0].price=0;
    expect(runChecks(d).find(c=>c.key==='items')?.ok).toBe(true);
  });
  it('zero net removes net check', () => {
    const d=doc(); d.totals.net=0; d.wordsPrinted='';
    expect(runChecks(d).find(c=>c.key==='net')).toBeUndefined();
  });
  it('VAT tolerance rounds upward beyond specified bound', () => {
    const d=doc(); d.totals.taxable=502.5; d.totals.vat=36.19;
    expect(runChecks(d).find(c=>c.key==='vat')?.ok).toBe(true);
    expect(Math.abs(35.18-36.19)>Math.max(1,502.5*0.002)).toBe(true);
  });
  it('printed Thai correction leaves displayed Thai stale', () => {
    const d=doc(); d.wordsPrinted=bahtText(21); d.totals.net=21;
    const n=normalize(d);
    expect(n.words.th).not.toBe(d.wordsPrinted);
    expect(n.words.en).toBe('฿ 21.00');
    expect(runChecks(n).find(c=>c.key==='words')?.ok).toBe(true);
  });
  it('missing company accepted for claimability', () => {
    expect(claimable(doc(), '')).toBe(true);
  });
  it('extra tax ID digit is silently discarded', () => {
    const d=doc(); d.seller.taxId+='9';
    const n=normalize(d);
    expect(n.seller.taxId).toBe(sample.seller.taxId);
    expect(runChecks(n).find(c=>c.key==='sellerTax')?.ok).toBe(true);
  });
});
