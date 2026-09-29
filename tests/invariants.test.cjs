/* Des règles qui doivent TOUJOURS tenir, vérifiées sur 150 organisations tirées
 * au hasard (graine fixe : le test se rejoue à l'identique). Audit du 29/09 :
 * ce tirage a trouvé qu'une case à 0 personne effaçait toute la journée, et
 * qu'une plonge sans personne la faisait planter.
 *   - aucune exception, aucun nombre impossible ;
 *   - les lots d'une case l'un après l'autre ; une ligne robot, un lot à la fois ;
 *   - personne ne commence avant son amont ; rien ne finit après le poste ;
 *   - à l'heure + en retard + pas finies = commandes suivies ; aucun stock négatif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../moteur/production.js');
const { VOLS } = require('../vols-demo.js');

test('150 journées au hasard : aucune règle enfreinte, aucune journée refusée', () => {
let graine=20260929;const alea=()=>{graine=(graine*16807)%2147483647;return graine/2147483647;};
const choix=l=>l[Math.floor(alea()*l.length)];
const hh=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const erreurs=[],refusees=[];let n=0;
const classes=P.classesDeVols(VOLS,{delaiChargement:45});
const ids=classes.map(c=>c.id);
const SERV=['cuisine','preparation','prepa','dotation'];
const bareme={};for(const s of SERV)bareme[s]={'*/BC':20+alea()*40,'*/PC':15,'*/YC':30,'*/CREW':8,'*/SPML':6};
for(let essai=0;essai<150;essai++){
  // chemin : cuisine → prépa → montage, dotation → montage
  const parcours=[{id:'p',nom:'p',noeuds:['cuisine','preparation','prepa','dotation'],liens:[{de:'cuisine',vers:'preparation'},{de:'preparation',vers:'prepa'},{de:'dotation',vers:'prepa'}]}];
  const ateliers=[];let k=0;
  for(const s of SERV){
    const nb=1+Math.floor(alea()*3);const mes=ids.filter(()=>alea()<0.8);
    for(let i=0;i<nb;i++){
      const part=mes.filter((_,j)=>j%nb===i);
      const lots=[];for(const c of part){if(lots.length&&alea()<0.2)lots[lots.length-1].push(c);else lots.push([c]);}
      const robot=s==='prepa'&&alea()<0.3;
      ateliers.push({id:'a'+(k++),nom:s+i,service:s,type:robot?'robot':'manuel',debut:hh(Math.floor(alea()*20)*60+choix([0,15,30])),
        jour:s==='cuisine'?choix([0,-1]):0,personnes:choix([0,1,2,3,5]),pauses:alea()<0.2?[{de:'12:00',a:'12:30'}]:[],lots,
        regime:{actif:alea()<0.6,...(alea()<0.3?{presence:choix([120,300,495])}:{})},
        ...(robot?{debit:choix([60,200,400]),personnesMin:1,...(alea()<0.5?{arretsLigne:[{de:'12:15',a:'13:00'}]}:{}),...(alea()<0.2?{lignePropre:true}:{})}:{}),
        ...(s==='prepa'&&!robot&&alea()<0.3?{fusion:'preparation'}:{}),
        ...(alea()<0.3?{materiel:'consomme'}:{})});
    }
  }
  if(alea()<0.5)ateliers.push({id:'pl',nom:'Plonge',service:'plonge',type:'lavage',debut:'00:00',jour:-1,personnes:choix([0,1,3]),pauses:[],lots:[],regime:{actif:false},
    ...(alea()<0.5?{parVol:true,durees:{'*':choix([10,40])}}:{}),tunnels:[{nom:'T1',debit:300,personnes:1,actif:true}]});
  const materiel={actif:alea()<0.4,delaiRetour:30,stockInitial:choix([0,50,500]),retours:choix(['programme','j1'])};
  let r;
  try{r=P.simuler({vols:VOLS,classes,ateliers,liaisons:[],bareme,rendement:choix([0.8,1]),parcours,parcoursCabine:{BC:'p',PC:'p',YC:'p',CREW:'p',SPML:'p'},materiel});}
  catch(e){erreurs.push(['exception',essai,e.message,(e.stack||'').split('\n').slice(1,5).join(' / '),JSON.stringify(ateliers.filter(a=>a.type!=='manuel'||a.personnes===0).map(a=>({t:a.type,p:a.personnes,f:a.fusion,pv:a.parVol,tu:a.tunnels})))]);continue;}
  n++;
  if(!r.ok){refusees.push(r.anomalies.map(a=>a.code));continue;}
  const lots=r.lots.filter(l=>!l.dispo&&!l.handling&&!l.retourVol);
  // 1. Pas de nombre impossible.
  for(const [k2,v] of Object.entries(r.indicateurs))if(typeof v==='number'&&!Number.isFinite(v))erreurs.push(['indicateur',essai,k2,v]);
  for(const l of lots){
    if(l.fin!=null&&(l.fin<l.debut-1e-6||!Number.isFinite(l.fin)))erreurs.push(['fin<debut',essai,l.atelier,l.debut,l.fin]);
    if(l.attente<-1e-6)erreurs.push(['attente<0',essai,l.atelier,l.attente]);
  }
  // 2. Une case : ses lots l'un après l'autre.
  const parAt={};for(const l of lots)(parAt[l.atelier]=parAt[l.atelier]||[]).push(l);
  for(const [id,ls] of Object.entries(parAt)){const f=ls.filter(l=>l.fin!=null).sort((a,b)=>a.debut-b.debut);
    for(let i=1;i<f.length;i++)if(f[i].debut<f[i-1].fin-1e-6)erreurs.push(['chevauchement case',essai,id,f[i-1].fin,f[i].debut]);}
  // 3. Une ligne robot : un lot à la fois.
  const lignes={};for(const a of ateliers.filter(a=>a.type==='robot')){const kk=a.lignePropre?a.id:'L';for(const l of (parAt[a.id]||[]))if(l.fin!=null)(lignes[kk]=lignes[kk]||[]).push(l);}
  for(const [kk,ls] of Object.entries(lignes)){ls.sort((a,b)=>a.debut-b.debut);for(let i=1;i<ls.length;i++)if(ls[i].debut<ls[i-1].fin-1e-6)erreurs.push(['ligne robot partagée',essai,kk,ls[i-1].atelier,ls[i-1].fin,ls[i].atelier,ls[i].debut]);}
  // 4. Personne ne commence avant ce qu'il attend (amont direct produit pour la classe).
  const fait=(s,c)=>lots.find(l=>l.service===s&&(l.classes||[]).includes(c));
  const fusions=new Set(ateliers.filter(a=>a.fusion&&a.type==='manuel').flatMap(a=>a.lots.flat().map(c=>a.fusion+'|'+c)));
  for(const l of lots){ if(l.fin==null)continue;
    for(const c of l.classes||[]){
      const amonts={prepa:['preparation','dotation'],preparation:['cuisine'],dotation:[],cuisine:[]}[l.service]||[];
      for(const s0 of amonts){
        let s=s0;let a=fait(s,c);
        // étape absorbée par une case à la chaîne, ou sautée : on remonte
        if(!a&&s==='preparation'){const fu=fusions.has('preparation|'+c);if(fu&&l.service==='prepa')s='cuisine';else if(!fu)s='cuisine';a=fait(s,c);}
        if(a&&a.fin!=null&&l.debut<a.fin-1e-6)erreurs.push(['avant son amont',essai,l.service,c,'commence',P.hhmm(l.debut),s,'finit',P.hhmm(a.fin)]);
        if(a&&a.fin==null&&l.fin!=null)erreurs.push(['fini sans son amont',essai,l.service,c,s]);
      }
    }
  }
  // 5. Poste : rien ne finit après la fin de poste d'une case au régime actif.
  for(const a of r.ateliers){if(!Number.isFinite(a.finPoste))continue;for(const l of (parAt[a.id]||[]))if(l.fin!=null&&l.fin>a.finPoste+1e-6)erreurs.push(['après le poste',essai,a.id,a.finPoste,l.fin]);}
  // 6. Cohérence des compteurs.
  const i=r.indicateurs;if(i.enRetard+i.pasFinies+i.aHeure!==i.classesSuivies)erreurs.push(['compteurs',essai,i.enRetard,i.pasFinies,i.aHeure,i.classesSuivies]);
  if(r.materiel&&(r.materiel.restePropre<-1e-6||r.materiel.resteSale<-1e-6))erreurs.push(['stock négatif',essai,r.materiel]);
}

assert.deepEqual(refusees,[],'une organisation incomplète se calcule quand même');
assert.deepEqual(erreurs.slice(0,5),[],erreurs.length+' règles enfreintes');
assert.equal(n,150);
});
