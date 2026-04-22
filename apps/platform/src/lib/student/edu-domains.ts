// Allowlisted US university .edu domains. Submissions from these auto-tag
// `university_name` and skip the "unknown .edu — flag for manual review"
// path. The list is intentionally not exhaustive: unknown .edu addresses
// still get queued for admin review, just without the auto-tag.
//
// Adding a school is cheap — drop a line and redeploy. Don't agonize over
// completeness here. Don't auto-block sketchy submissions: admin eyeball
// is the real gate.

export interface EduDomain {
  domain: string         // lowercase, no scheme, no www
  name: string           // canonical display name
  state?: string         // two-letter
}

export const EDU_DOMAINS: readonly EduDomain[] = [
  // Ivy / NESCAC / top-tier privates
  { domain: 'harvard.edu',        name: 'Harvard University',                state: 'MA' },
  { domain: 'mit.edu',            name: 'MIT',                                state: 'MA' },
  { domain: 'yale.edu',           name: 'Yale University',                   state: 'CT' },
  { domain: 'princeton.edu',      name: 'Princeton University',              state: 'NJ' },
  { domain: 'stanford.edu',       name: 'Stanford University',               state: 'CA' },
  { domain: 'columbia.edu',       name: 'Columbia University',               state: 'NY' },
  { domain: 'cornell.edu',        name: 'Cornell University',                state: 'NY' },
  { domain: 'upenn.edu',          name: 'University of Pennsylvania',        state: 'PA' },
  { domain: 'dartmouth.edu',      name: 'Dartmouth College',                 state: 'NH' },
  { domain: 'brown.edu',          name: 'Brown University',                  state: 'RI' },
  { domain: 'duke.edu',           name: 'Duke University',                   state: 'NC' },
  { domain: 'uchicago.edu',       name: 'University of Chicago',             state: 'IL' },
  { domain: 'northwestern.edu',   name: 'Northwestern University',           state: 'IL' },
  { domain: 'jhu.edu',            name: 'Johns Hopkins University',          state: 'MD' },
  { domain: 'rice.edu',           name: 'Rice University',                   state: 'TX' },
  { domain: 'vanderbilt.edu',     name: 'Vanderbilt University',             state: 'TN' },
  { domain: 'emory.edu',          name: 'Emory University',                  state: 'GA' },
  { domain: 'wustl.edu',          name: 'Washington University in St Louis', state: 'MO' },
  { domain: 'tufts.edu',          name: 'Tufts University',                  state: 'MA' },
  { domain: 'georgetown.edu',     name: 'Georgetown University',             state: 'DC' },
  { domain: 'nd.edu',             name: 'University of Notre Dame',          state: 'IN' },
  { domain: 'usc.edu',            name: 'USC',                                state: 'CA' },
  { domain: 'caltech.edu',        name: 'Caltech',                           state: 'CA' },
  { domain: 'cmu.edu',            name: 'Carnegie Mellon University',        state: 'PA' },
  { domain: 'nyu.edu',            name: 'NYU',                                state: 'NY' },
  { domain: 'bu.edu',             name: 'Boston University',                 state: 'MA' },
  { domain: 'bc.edu',             name: 'Boston College',                    state: 'MA' },
  { domain: 'gwu.edu',            name: 'George Washington University',      state: 'DC' },
  { domain: 'amherst.edu',        name: 'Amherst College',                   state: 'MA' },
  { domain: 'williams.edu',       name: 'Williams College',                  state: 'MA' },
  { domain: 'wesleyan.edu',       name: 'Wesleyan University',               state: 'CT' },
  { domain: 'middlebury.edu',     name: 'Middlebury College',                state: 'VT' },
  { domain: 'bowdoin.edu',        name: 'Bowdoin College',                   state: 'ME' },
  { domain: 'colby.edu',          name: 'Colby College',                     state: 'ME' },
  { domain: 'bates.edu',          name: 'Bates College',                     state: 'ME' },
  { domain: 'colgate.edu',        name: 'Colgate University',                state: 'NY' },
  { domain: 'hamilton.edu',       name: 'Hamilton College',                  state: 'NY' },
  { domain: 'trinity.edu',        name: 'Trinity College',                   state: 'CT' },
  { domain: 'lafayette.edu',      name: 'Lafayette College',                 state: 'PA' },
  { domain: 'lehigh.edu',         name: 'Lehigh University',                 state: 'PA' },
  { domain: 'bucknell.edu',       name: 'Bucknell University',               state: 'PA' },
  { domain: 'villanova.edu',      name: 'Villanova University',              state: 'PA' },

  // Big public flagships
  { domain: 'berkeley.edu',       name: 'UC Berkeley',                       state: 'CA' },
  { domain: 'ucla.edu',           name: 'UCLA',                              state: 'CA' },
  { domain: 'ucsd.edu',           name: 'UC San Diego',                      state: 'CA' },
  { domain: 'ucsb.edu',           name: 'UC Santa Barbara',                  state: 'CA' },
  { domain: 'ucdavis.edu',        name: 'UC Davis',                          state: 'CA' },
  { domain: 'uci.edu',            name: 'UC Irvine',                         state: 'CA' },
  { domain: 'ucr.edu',            name: 'UC Riverside',                      state: 'CA' },
  { domain: 'ucsc.edu',           name: 'UC Santa Cruz',                     state: 'CA' },
  { domain: 'umich.edu',          name: 'University of Michigan',            state: 'MI' },
  { domain: 'msu.edu',            name: 'Michigan State University',         state: 'MI' },
  { domain: 'wisc.edu',           name: 'University of Wisconsin–Madison',   state: 'WI' },
  { domain: 'umn.edu',            name: 'University of Minnesota',           state: 'MN' },
  { domain: 'illinois.edu',       name: 'University of Illinois Urbana-Champaign', state: 'IL' },
  { domain: 'purdue.edu',         name: 'Purdue University',                 state: 'IN' },
  { domain: 'indiana.edu',        name: 'Indiana University',                state: 'IN' },
  { domain: 'iu.edu',             name: 'Indiana University',                state: 'IN' },
  { domain: 'osu.edu',            name: 'Ohio State University',             state: 'OH' },
  { domain: 'psu.edu',            name: 'Penn State University',             state: 'PA' },
  { domain: 'pitt.edu',           name: 'University of Pittsburgh',          state: 'PA' },
  { domain: 'rutgers.edu',        name: 'Rutgers University',                state: 'NJ' },
  { domain: 'umd.edu',            name: 'University of Maryland',            state: 'MD' },
  { domain: 'virginia.edu',       name: 'University of Virginia',            state: 'VA' },
  { domain: 'vt.edu',             name: 'Virginia Tech',                     state: 'VA' },
  { domain: 'unc.edu',            name: 'UNC Chapel Hill',                   state: 'NC' },
  { domain: 'ncsu.edu',           name: 'NC State',                          state: 'NC' },
  { domain: 'gatech.edu',         name: 'Georgia Tech',                      state: 'GA' },
  { domain: 'uga.edu',            name: 'University of Georgia',             state: 'GA' },
  { domain: 'fsu.edu',            name: 'Florida State University',          state: 'FL' },
  { domain: 'ufl.edu',            name: 'University of Florida',             state: 'FL' },
  { domain: 'miami.edu',          name: 'University of Miami',               state: 'FL' },
  { domain: 'utexas.edu',         name: 'UT Austin',                         state: 'TX' },
  { domain: 'tamu.edu',           name: 'Texas A&M University',              state: 'TX' },
  { domain: 'baylor.edu',         name: 'Baylor University',                 state: 'TX' },
  { domain: 'smu.edu',            name: 'SMU',                                state: 'TX' },
  { domain: 'tcu.edu',            name: 'TCU',                                state: 'TX' },
  { domain: 'ou.edu',             name: 'University of Oklahoma',            state: 'OK' },
  { domain: 'okstate.edu',        name: 'Oklahoma State University',         state: 'OK' },
  { domain: 'colorado.edu',       name: 'CU Boulder',                        state: 'CO' },
  { domain: 'colostate.edu',      name: 'Colorado State University',         state: 'CO' },
  { domain: 'arizona.edu',        name: 'University of Arizona',             state: 'AZ' },
  { domain: 'asu.edu',            name: 'Arizona State University',          state: 'AZ' },
  { domain: 'unlv.edu',           name: 'UNLV',                               state: 'NV' },
  { domain: 'unr.edu',            name: 'University of Nevada, Reno',        state: 'NV' },
  { domain: 'utah.edu',           name: 'University of Utah',                state: 'UT' },
  { domain: 'byu.edu',            name: 'BYU',                                state: 'UT' },
  { domain: 'oregonstate.edu',    name: 'Oregon State University',           state: 'OR' },
  { domain: 'uoregon.edu',        name: 'University of Oregon',              state: 'OR' },
  { domain: 'washington.edu',     name: 'University of Washington',          state: 'WA' },
  { domain: 'wsu.edu',            name: 'Washington State University',       state: 'WA' },

  // Other large schools commonly seen
  { domain: 'syracuse.edu',       name: 'Syracuse University',               state: 'NY' },
  { domain: 'fordham.edu',        name: 'Fordham University',                state: 'NY' },
  { domain: 'binghamton.edu',     name: 'Binghamton University',             state: 'NY' },
  { domain: 'buffalo.edu',        name: 'University at Buffalo',             state: 'NY' },
  { domain: 'stonybrook.edu',     name: 'Stony Brook University',            state: 'NY' },
  { domain: 'umass.edu',          name: 'UMass Amherst',                     state: 'MA' },
  { domain: 'northeastern.edu',   name: 'Northeastern University',           state: 'MA' },
  { domain: 'brandeis.edu',       name: 'Brandeis University',               state: 'MA' },
  { domain: 'temple.edu',         name: 'Temple University',                 state: 'PA' },
  { domain: 'drexel.edu',         name: 'Drexel University',                 state: 'PA' },
  { domain: 'wfu.edu',            name: 'Wake Forest University',            state: 'NC' },
  { domain: 'auburn.edu',         name: 'Auburn University',                 state: 'AL' },
  { domain: 'ua.edu',             name: 'University of Alabama',             state: 'AL' },
  { domain: 'lsu.edu',            name: 'LSU',                                state: 'LA' },
  { domain: 'tulane.edu',         name: 'Tulane University',                 state: 'LA' },
  { domain: 'uark.edu',           name: 'University of Arkansas',            state: 'AR' },
  { domain: 'olemiss.edu',        name: 'Ole Miss',                          state: 'MS' },
  { domain: 'msstate.edu',        name: 'Mississippi State University',      state: 'MS' },
  { domain: 'utk.edu',            name: 'University of Tennessee Knoxville', state: 'TN' },
  { domain: 'memphis.edu',        name: 'University of Memphis',             state: 'TN' },
  { domain: 'uky.edu',            name: 'University of Kentucky',            state: 'KY' },
  { domain: 'louisville.edu',     name: 'University of Louisville',          state: 'KY' },
  { domain: 'wvu.edu',            name: 'West Virginia University',          state: 'WV' },
  { domain: 'uconn.edu',          name: 'UConn',                              state: 'CT' },
  { domain: 'rit.edu',            name: 'Rochester Institute of Technology', state: 'NY' },
  { domain: 'rochester.edu',      name: 'University of Rochester',           state: 'NY' },
  { domain: 'rpi.edu',            name: 'Rensselaer Polytechnic Institute',  state: 'NY' },
  { domain: 'wpi.edu',            name: 'Worcester Polytechnic Institute',   state: 'MA' },
] as const

const DOMAIN_INDEX: Map<string, EduDomain> = new Map(
  EDU_DOMAINS.map((d) => [d.domain, d]),
)

export function lookupEduDomain(domain: string): EduDomain | null {
  return DOMAIN_INDEX.get(domain.toLowerCase()) ?? null
}

export type EduCategory = 'allowlisted' | 'unknown_edu' | 'not_edu' | 'invalid'

export interface EduCategorization {
  category: EduCategory
  domain: string | null
  university: EduDomain | null
}

/**
 * Bucket a submitted edu email. We accept the "unknown .edu" bucket but
 * surface it for manual admin review in /admin/students. We reject
 * anything that doesn't end in `.edu` outright.
 *
 * Note: we DO NOT mail-server-verify. The user already auth'd against their
 * primary email; the .edu submission is a self-claim that admin spot-checks
 * alongside the IG + LinkedIn.
 */
export function categorizeEduEmail(rawEmail: string): EduCategorization {
  const trimmed = rawEmail.trim().toLowerCase()
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { category: 'invalid', domain: null, university: null }
  }
  const domain = trimmed.split('@')[1] ?? ''
  // Reject .edu.xx (foreign), accept any plain .edu top-level
  if (!domain.endsWith('.edu')) {
    return { category: 'not_edu', domain, university: null }
  }
  if (domain.split('.').length > 2) {
    // e.g. cs.harvard.edu — accept as the parent domain
    const parent = domain.split('.').slice(-2).join('.')
    const known = lookupEduDomain(parent)
    if (known) return { category: 'allowlisted', domain: parent, university: known }
  }
  const known = lookupEduDomain(domain)
  if (known) return { category: 'allowlisted', domain, university: known }
  return { category: 'unknown_edu', domain, university: null }
}
