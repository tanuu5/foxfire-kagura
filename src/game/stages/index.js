// ステージの一覧（番号 → 台本）。本物のステージができるまでは、確認用の台本を 1 面に置いておく。
import test from './test.js';
import stage1 from './stage1.js';
import stage2 from './stage2.js';
import stage3 from './stage3.js';
import extra from './extra.js';

export const STAGES = {
  1: stage1,
  2: stage2,
  3: stage3,
  ex: extra,   // おまけ（Clawd 戦）。タイトルの「おまけ」から
  test,
};
