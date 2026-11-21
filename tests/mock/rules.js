// Tiruan peraturan Firestore (ruang kelab v3.45.1) untuk mock — meniru logik yang di-Publish.
export const ORG_SPACES = { ksasjb: ['ksas', 'helang', 'singa', 'naga', 'nagaelit', 'ksasall', 'kroni'], kskpkpjb: ['kskpkpjb'] };
export function makeRules(D, authOf) {
  const A = () => authOf();
  const email = () => (A() && A().emailVerified && A().email ? A().email.toLowerCase() : '');
  const role = () => (email() && D['roles/' + email()]) || null;
  const isAdmin = () => !!role() && role().role === 'admin';
  const myClubs = () => (role() && role().clubs) || [];
  const clubAdmin = sp => isAdmin() && myClubs().includes(sp);
  const orgAdmin = org => isAdmin() && myClubs().some(s => (ORG_SPACES[org] || []).includes(s));
  const member = (org, sp) => { const m = A() && D[`clubs/${org}/members/${A().uid}`]; return !!m && m.status === 'ok' && (m.spaces || []).includes(sp); };
  const mgr0 = tid => { const o = D['owners/' + tid]; return isAdmin() && o && o.email === email(); };
  return function check(op, path, data, before) {
    const p = path.split('/');
    if (p[0] === 'clubs') {
      const org = p[1], col = p[2], id = p[3];
      if (col === 'members') {
        if (op === 'read') return (A() && A().uid === id) || orgAdmin(org);
        if (op === 'create') return !!A() && A().uid === id && !A().isAnonymous
          && Object.keys(data).every(k => ['uid', 'name', 'email', 'space', 'note', 'status', 'at'].includes(k))
          && data.uid === id && data.status === 'pending' && typeof data.name === 'string' && data.name.length <= 50 && (ORG_SPACES[org] || []).includes(data.space);
        if (op === 'update') return orgAdmin(org);
        if (op === 'delete') return orgAdmin(org) || (A() && A().uid === id);
      }
      if (col === 'players' || col === 'links') return orgAdmin(org);
      if (col === 'stats') {
        if (op === 'read') return orgAdmin(org) || (id !== '_org' && id !== '__col__' && member(org, id));
        return orgAdmin(org) && (id === '_org' || (ORG_SPACES[org] || []).includes(id));
      }
      return false;
    }
    if (p[0] === 'tournaments' && p.length === 2) {
      if (op === 'read') return true;
      if (op === 'create') return isAdmin() && (!myClubs().length || myClubs().includes(data.clubId));
      if (op === 'update') return mgr0(p[1]) || (clubAdmin(before.clubId) && clubAdmin(data.clubId));
      if (op === 'delete') return isAdmin();
    }
    return true;
  };
}
