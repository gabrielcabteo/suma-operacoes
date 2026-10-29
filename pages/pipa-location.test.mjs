import assert from 'node:assert/strict';
import {locationHandler} from '../supabase/functions/pipa-location/handler.mjs';
import {addressFromPhoton,validCoordinates} from '../supabase/functions/pipa-location/format.mjs';
const origin='https://gabrielcabteo.github.io';
const sample={features:[{properties:{street:'Rua de teste',housenumber:'123',district:'Centro',city:'Ribeirão Preto'}}]};
const expected={location:'Rua de teste, 123',neighborhood:'Centro',city:'Ribeirão Preto',attribution:'Photon/Komoot · © OpenStreetMap contributors'};
assert.deepEqual(addressFromPhoton(sample),expected);
assert.equal(addressFromPhoton({features:[]}),null);
assert.equal(addressFromPhoton({features:[{properties:{city:'Cidade sem rua'}}]}),null);
assert.equal(addressFromPhoton({features:[{properties:{name:'Praça de teste',suburb:'Bairro'}}]}).neighborhood,'Bairro');
assert.equal(addressFromPhoton({features:[{properties:{street:'X'.repeat(500)}}]}).location.length,160);
assert.ok(validCoordinates(0,0));assert.ok(validCoordinates(-21.1775,-47.8103));
for(const pair of [[91,0],[0,-181],[NaN,0],[0,Infinity],['-21',0],[null,0]])assert.equal(validCoordinates(...pair),false);
function setup(overrides={}){
 const calls={auth:0,claim:[],lookup:[],stored:[]};
 const handler=locationHandler({
  async authenticate(token){calls.auth++;return token==='fixture-token'},
  async claim(input){calls.claim.push(input);return {key:'fixture-key'}},
  async lookup(...coordinates){calls.lookup.push(coordinates);return sample},
  async store(key,value){calls.stored.push({key,value})},
  ...overrides
 });
 return {handler,calls};
}
function request({method='POST',token='fixture-token',body={latitude:-21.1775,longitude:-47.8103},from=origin}={}){
 const headers={'Origin':from,'apikey':'fixture-public-key'};
 if(token)headers.Authorization='Bearer '+token;
 return new Request('https://example.invalid/pipa-location',{method,headers,...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
}
{
 const {handler,calls}=setup(),r=await handler(request());assert.equal(r.status,200);assert.deepEqual(await r.json(),expected);
 assert.deepEqual(calls.lookup,[[-21.1775,-47.8103]]);assert.equal(calls.stored.length,1);assert.equal(calls.claim[0].token,'fixture-token');
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
}
{
 const {handler,calls}=setup();assert.equal((await handler(request({token:null}))).status,401);assert.equal((await handler(request({token:'wrong'}))).status,401);assert.equal(calls.lookup.length,0);
}
{
 const {handler,calls}=setup();assert.equal((await handler(request({from:'https://unrelated.invalid'}))).status,403);assert.equal(calls.auth,0);assert.equal((await handler(request({method:'GET'}))).status,405);assert.equal((await handler(request({method:'OPTIONS',token:null}))).status,200);
}
{
 const {handler,calls}=setup();assert.equal((await handler(request({body:{latitude:999,longitude:0}}))).status,400);assert.equal((await handler(request({body:'broken JSON'}))).status,400);assert.equal((await handler(request({body:'X'.repeat(5000)}))).status,413);assert.equal(calls.lookup.length,0);
}
{
 const {handler,calls}=setup({async claim(){return {error:true}}});assert.equal((await handler(request())).status,403);assert.equal(calls.lookup.length,0);
}
{
 const {handler,calls}=setup({async claim(){return {cached:expected}}});assert.deepEqual(await(await handler(request())).json(),expected);assert.equal(calls.lookup.length,0);
}
{
 const {handler,calls}=setup({async claim(){return {retry:true}}});assert.equal((await handler(request())).status,429);assert.equal(calls.lookup.length,0);
}
{
 const {handler}=setup({async lookup(){return {features:[]}}});assert.equal((await handler(request())).status,404);
}
{
 const {handler}=setup({async lookup(){throw Error('Fixture network failure')}});assert.equal((await handler(request())).status,502);
}
{
 const {handler}=setup({async store(){throw Error('Fixture cache failure')}});assert.equal((await handler(request())).status,200);
}
console.log('Location checks passed: authentication, assignment gate, CORS, coordinate validation, cache/rate gate, address parsing and safe failures.');
