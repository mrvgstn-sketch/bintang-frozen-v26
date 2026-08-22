'use strict';
const assert=require('assert');
global.window={
  BFCore:{storage:{list:()=>[]}},
  BFSetoranStore:{list:()=>[]}
};
require('../assets/js/setoran-canonical-split.js');
const api=window.BFSetoranSplitRead;
assert(api,'split Setoran read compatibility API must load');
const mixed={metode:'Cash/BCA',nominal:6682000};
assert.strictEqual(api.isLegacyMixed(mixed),true);
assert.strictEqual(api.methodSummary(mixed).key,'MIXED');
assert.match(api.methodSummary(mixed).label,/Metode Campuran \/ Catatan Lama/);
assert.strictEqual(api.components(mixed)[0].method,'LEGACY_MIXED');
const transfer={metode:'Bca',nominal:500000};
assert.strictEqual(api.isLegacyMixed(transfer),false);
assert.strictEqual(api.methodSummary(transfer).key,'TRANSFER');
assert.match(api.methodSummary(transfer).label,/BCA/);
console.log('R13 legacy mixed Setoran read compatibility PASS');
