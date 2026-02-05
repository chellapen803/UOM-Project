import nlp from 'compromise';
import { GraphData, Node, Link } from '../types';
import { PdfPage } from './pdfService';

/**
 * Sentence-aware text chunking using NLP
 * Better than simple character-based chunking as it respects sentence boundaries
 */
export const chunkText = (text: string, chunkSize: number = 15000): string[] => {
  const doc = nlp(text);
  const sentences = doc.sentences().out('array');
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    
    if (testChunk.length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk = testChunk;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text]; // Fallback to original text if no sentences found
};

/**
 * Extract entities from text using NLP
 * Extracts people, places, organizations, and key concepts
 * Optimized: accepts optional pre-created NLP doc to avoid re-parsing
 */
const extractEntities = (text: string, doc?: any): Node[] => {
  const entityStart = performance.now();
  const textLength = text.length;
  
  // Reuse doc if provided, otherwise create new one
  const nlpDoc = doc || nlp(text);
  
  const nodes: Node[] = [];
  const seenIds = new Set<string>();
  
  // Extract people
  const people = nlpDoc.people().out('array');
  people.forEach(person => {
    const id = person.toLowerCase().trim();
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      nodes.push({
        id: id,
        label: 'Person',
        group: 1
      });
    }
  });
  
  // Extract places
  const places = nlpDoc.places().out('array');
  places.forEach(place => {
    const id = place.toLowerCase().trim();
    if (id && !seenIds.has(id) && id.length > 2) {
      seenIds.add(id);
      nodes.push({
        id: id,
        label: 'Location',
        group: 2
      });
    }
  });
  
  // Extract organizations (companies, institutions)
  const organizations = nlpDoc.organizations().out('array');
  organizations.forEach(org => {
    const id = org.toLowerCase().trim();
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      nodes.push({
        id: id,
        label: 'Organization',
        group: 3
      });
    }
  });
  
  // Extract important nouns (concepts, topics)
  const nouns = nlpDoc.nouns().out('array');
  const importantNouns = nouns
    .filter(noun => noun.length > 3 && !isCommonWord(noun.toLowerCase()))
    .slice(0, 20); // Limit to top 20 concepts
  
  importantNouns.forEach(noun => {
    const id = noun.toLowerCase().trim();
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      nodes.push({
        id: id,
        label: 'Concept',
        group: 4
      });
    }
  });
  
  const totalTime = performance.now() - entityStart;
  console.log(`[PERF] ✅ Entities: ${nodes.length} found in ${totalTime.toFixed(0)}ms`);
  
  return nodes;
};

/**
 * Extract semantic context from sentence using advanced NLP
 */
const extractSemanticContext = (sentence: string, sourceId: string, targetId: string) => {
  const sentDoc = nlp(sentence);
  const lowerSentence = sentence.toLowerCase();
  
  // Extract verbs and their forms
  const verbs = sentDoc.verbs().out('array');
  const verbString = verbs.join(' ').toLowerCase();
  
  // Extract prepositions (important for relationships)
  const prepositions = sentDoc.prepositions().out('array');
  const prepString = prepositions.join(' ').toLowerCase();
  
  // Extract adjectives (can indicate relationship quality)
  const adjectives = sentDoc.adjectives().out('array');
  const adjString = adjectives.join(' ').toLowerCase();
  
  // Extract text between entities
  const sourcePos = lowerSentence.indexOf(sourceId);
  const targetPos = lowerSentence.indexOf(targetId);
  const textBetween = sourcePos < targetPos 
    ? lowerSentence.substring(sourcePos + sourceId.length, targetPos).trim()
    : lowerSentence.substring(targetPos + targetId.length, sourcePos).trim();
  
  // Extract verb phrases (verb + object patterns)
  const verbPhrases: string[] = [];
  verbs.forEach(verb => {
    const verbLower = verb.toLowerCase();
    const verbIndex = lowerSentence.indexOf(verbLower);
    if (verbIndex !== -1) {
      // Try to find object after verb
      const afterVerb = lowerSentence.substring(verbIndex + verb.length, verbIndex + verb.length + 50);
      verbPhrases.push(afterVerb.trim());
    }
  });
  
  // Check for passive voice indicators
  const isPassive = verbString.includes('was') || verbString.includes('were') || 
                    verbString.includes('been') || verbString.includes('is') ||
                    prepString.includes('by');
  
  // Extract noun phrases that might indicate relationships
  // Note: Some versions/plugins of `compromise` don't support `.toNounPhrase()`,
  // so we fall back to plain nouns to avoid runtime errors.
  let nounPhrases: string[] = [];
  try {
    // @ts-ignore - toNounPhrase may not exist depending on compromise version
    if (typeof sentDoc.nouns().toNounPhrase === 'function') {
      // Use richer noun phrase extraction when available
      // @ts-ignore
      nounPhrases = sentDoc.nouns().toNounPhrase().out('array');
    } else {
      nounPhrases = sentDoc.nouns().out('array');
    }
  } catch {
    nounPhrases = sentDoc.nouns().out('array');
  }
  
  return {
    verbs,
    verbString,
    prepositions: prepositions,
    prepString,
    adjectives,
    adjString,
    textBetween,
    verbPhrases,
    isPassive,
    nounPhrases,
    sourcePos,
    targetPos
  };
};

/**
 * Determine relationship type based on entity types and sentence context
 * Enhanced with deeper semantic analysis
 */
const inferRelationshipType = (
  sourceNode: Node,
  targetNode: Node,
  sentence: string,
  sourceIndex: number,
  targetIndex: number
): string => {
  const lowerSentence = sentence.toLowerCase();
  const sourceLabel = sourceNode.label;
  const targetLabel = targetNode.label;
  
  // Extract comprehensive semantic context
  const context = extractSemanticContext(sentence, sourceNode.id, targetNode.id);
  const { verbString, prepString, textBetween, isPassive, verbPhrases } = context;
  
  // Combined analysis string for pattern matching
  const analysisText = `${verbString} ${prepString} ${textBetween}`.toLowerCase();
  
  // Extended pattern matching for explicit relationship phrases
  const patterns: { [key: string]: string } = {
    // Employment/Work relationships
    'works for': 'WORKS_FOR',
    'employee of': 'WORKS_FOR',
    'employed by': 'WORKS_FOR',
    'works at': 'WORKS_FOR',
    'member of': 'MEMBER_OF',
    'part of': 'PART_OF',
    'belongs to': 'BELONGS_TO',
    
    // Location relationships
    'located in': 'LOCATED_IN',
    'based in': 'LOCATED_IN',
    'situated in': 'LOCATED_IN',
    'found in': 'LOCATED_IN',
    'from': 'FROM',
    
    // Creation/Founding relationships
    'created by': 'CREATED_BY',
    'founded by': 'FOUNDED_BY',
    'established by': 'ESTABLISHED_BY',
    'developed by': 'DEVELOPED_BY',
    'invented by': 'INVENTED_BY',
    'created': 'CREATES',
    'founded': 'FOUNDED',
    'established': 'ESTABLISHED',
    
    // Usage/Application relationships
    'uses': 'USES',
    'utilizes': 'USES',
    'employs': 'USES',
    'implements': 'IMPLEMENTS',
    'applies': 'APPLIES',
    
    // Ownership/Control relationships
    'owns': 'OWNS',
    'owned by': 'OWNED_BY',
    'controls': 'CONTROLS',
    'managed by': 'MANAGED_BY',
    'operates': 'OPERATES',
    
    // Collaboration/Partnership relationships
    'partners with': 'PARTNERS_WITH',
    'collaborates with': 'COLLABORATES_WITH',
    'works with': 'WORKS_WITH',
    'cooperates with': 'COOPERATES_WITH',
    
    // Hierarchical relationships
    'reports to': 'REPORTS_TO',
    'supervised by': 'SUPERVISED_BY',
    'manages': 'MANAGES',
    'leads': 'LEADS',
    
    // Academic/Educational relationships
    'studied at': 'STUDIED_AT',
    'graduated from': 'GRADUATED_FROM',
    'teaches at': 'TEACHES_AT',
    'professor at': 'TEACHES_AT',
    
    // Research/Study relationships
    'researches': 'RESEARCHES',
    'studies': 'STUDIES',
    'focuses on': 'FOCUSES_ON',
    'specializes in': 'SPECIALIZES_IN',
    
    // Concept relationships
    'includes': 'INCLUDES',
    'contains': 'CONTAINS',
    'consists of': 'CONSISTS_OF',
    'comprises': 'COMPRISES',
    'defines': 'DEFINES',
    'describes': 'DESCRIBES',
    'explains': 'EXPLAINS',
    
    // Temporal relationships
    'before': 'BEFORE',
    'after': 'AFTER',
    'during': 'DURING',
    'precedes': 'PRECEDES',
    
    // Communication/Interaction relationships
    'communicates with': 'COMMUNICATES_WITH',
    'contacted': 'CONTACTED',
    'meets with': 'MEETS_WITH',
    'discusses': 'DISCUSSES',
    'talks to': 'TALKS_TO',
    'speaks with': 'SPEAKS_WITH',
    'corresponds with': 'CORRESPONDS_WITH',
    
    // Influence/Impact relationships
    'influences': 'INFLUENCES',
    'affects': 'AFFECTS',
    'impacts': 'IMPACTS',
    'causes': 'CAUSES',
    'leads to': 'LEADS_TO',
    'results in': 'RESULTS_IN',
    'triggers': 'TRIGGERS',
    
    // Support/Assistance relationships
    'supports': 'SUPPORTS',
    'helps': 'HELPS',
    'assists': 'ASSISTS',
    'aids': 'AIDS',
    'enables': 'ENABLES',
    'facilitates': 'FACILITATES',
    
    // Opposition/Conflict relationships
    'opposes': 'OPPOSES',
    'competes with': 'COMPETES_WITH',
    'rivals': 'RIVALS',
    'conflicts with': 'CONFLICTS_WITH',
    'challenges': 'CHALLENGES',
    
    // Dependency relationships
    'depends on': 'DEPENDS_ON',
    'relies on': 'RELIES_ON',
    'requires': 'REQUIRES',
    'needs': 'NEEDS',
    
    // Similarity/Comparison relationships
    'similar to': 'SIMILAR_TO',
    'like': 'LIKE',
    'compared to': 'COMPARED_TO',
    'resembles': 'RESEMBLES',
    
    // Difference relationships
    'different from': 'DIFFERENT_FROM',
    'unlike': 'UNLIKE',
    'versus': 'VERSUS',
    
    // Measurement/Quantification relationships
    'measures': 'MEASURES',
    'quantifies': 'QUANTIFIES',
    'evaluates': 'EVALUATES',
    'assesses': 'ASSESSES',
    
    // Security/Safety relationships
    'protects': 'PROTECTS',
    'secures': 'SECURES',
    'defends': 'DEFENDS',
    'threatens': 'THREATENS',
    'vulnerable to': 'VULNERABLE_TO',
    
    // Compliance/Regulation relationships
    'complies with': 'COMPLIES_WITH',
    'regulated by': 'REGULATED_BY',
    'governed by': 'GOVERNED_BY',
    'follows': 'FOLLOWS',
    'adheres to': 'ADHERES_TO',
    
    // Implementation/Deployment relationships
    'deploys': 'DEPLOYS',
    'installs': 'INSTALLS',
    'configures': 'CONFIGURES',
    'maintains': 'MAINTAINS',
    'monitors': 'MONITORS',
    
    // Knowledge/Information relationships
    'knows': 'KNOWS',
    'learns': 'LEARNS',
    'teaches': 'TEACHES',
    'informs': 'INFORMS',
    'discovers': 'DISCOVERS',
    'reveals': 'REVEALS',
    
    // Action/Event relationships
    'performs': 'PERFORMS',
    'executes': 'EXECUTES',
    'conducts': 'CONDUCTS',
    'organizes': 'ORGANIZES',
    'hosts': 'HOSTS',
    'attends': 'ATTENDS',
    
    // Financial relationships
    'funds': 'FUNDS',
    'finances': 'FINANCES',
    'invests in': 'INVESTS_IN',
    'sponsors': 'SPONSORS',
    'pays': 'PAYS',
    
    // Technology relationships
    'develops': 'DEVELOPS',
    'designs': 'DESIGNS',
    'builds': 'BUILDS',
    'creates': 'CREATES',
    'produces': 'PRODUCES',
    'manufactures': 'MANUFACTURES',
    
    // Service relationships
    'serves': 'SERVES',
    'provides': 'PROVIDES',
    'offers': 'OFFERS',
    'delivers': 'DELIVERS',
    
    // Membership/Affiliation relationships
    'affiliated with': 'AFFILIATED_WITH',
    'associated with': 'ASSOCIATED_WITH',
    'connected to': 'CONNECTED_TO',
    'linked to': 'LINKED_TO',
    'related to': 'RELATED_TO',
  };
  
  // Check for explicit patterns with improved matching
  for (const [pattern, relType] of Object.entries(patterns)) {
    // Check in full sentence and in text between entities
    const patternInSentence = lowerSentence.includes(pattern);
    const patternInBetween = textBetween.includes(pattern);
    const patternInAnalysis = analysisText.includes(pattern);
    
    if (patternInSentence || patternInBetween || patternInAnalysis) {
      const patternIndex = lowerSentence.indexOf(pattern);
      const sourcePos = context.sourcePos;
      const targetPos = context.targetPos;
      
      // If pattern appears between entities or in analysis text, use it
      if (patternIndex > Math.min(sourcePos, targetPos) && 
          patternIndex < Math.max(sourcePos, targetPos)) {
        // Handle passive voice and directionality
        if (isPassive && (pattern.includes('by') || pattern.includes('from'))) {
          // Passive voice: "X was created by Y" means Y -> X with CREATED_BY
          if (targetPos < sourcePos) {
            return relType;
          }
        }
        return relType;
      }
      
      // Also check if pattern is in the analysis text (verb + prep + between)
      if (patternInAnalysis) {
        return relType;
      }
    }
  }
  
  // Advanced verb-based inference
  const verbBasedRel = inferFromVerbs(verbString, verbPhrases, sourceLabel, targetLabel, isPassive);
  if (verbBasedRel && verbBasedRel !== 'RELATED_TO') {
    return verbBasedRel;
  }
  
  // Enhanced entity type combination inference with context
  return inferFromEntityTypes(sourceLabel, targetLabel, verbString, prepString, textBetween, isPassive);
};

/**
 * Infer relationship from verb patterns
 */
const inferFromVerbs = (
  verbString: string,
  verbPhrases: string[],
  sourceLabel: string,
  targetLabel: string,
  isPassive: boolean
): string | null => {
  const verbs = verbString.toLowerCase();
  const phrases = verbPhrases.join(' ').toLowerCase();
  const combined = `${verbs} ${phrases}`;
  
  // Action verbs that indicate specific relationships
  const actionVerbs: { [key: string]: string } = {
    'develop': 'DEVELOPS',
    'design': 'DESIGNS',
    'build': 'BUILDS',
    'create': 'CREATES',
    'produce': 'PRODUCES',
    'manufacture': 'MANUFACTURES',
    'implement': 'IMPLEMENTS',
    'deploy': 'DEPLOYS',
    'install': 'INSTALLS',
    'configure': 'CONFIGURES',
    'maintain': 'MAINTAINS',
    'monitor': 'MONITORS',
    'protect': 'PROTECTS',
    'secure': 'SECURES',
    'defend': 'DEFENDS',
    'threaten': 'THREATENS',
    'support': 'SUPPORTS',
    'help': 'HELPS',
    'assist': 'ASSISTS',
    'enable': 'ENABLES',
    'facilitate': 'FACILITATES',
    'influence': 'INFLUENCES',
    'affect': 'AFFECTS',
    'impact': 'IMPACTS',
    'cause': 'CAUSES',
    'lead': 'LEADS_TO',
    'result': 'RESULTS_IN',
    'trigger': 'TRIGGERS',
    'depend': 'DEPENDS_ON',
    'rely': 'RELIES_ON',
    'require': 'REQUIRES',
    'need': 'NEEDS',
    'know': 'KNOWS',
    'learn': 'LEARNS',
    'teach': 'TEACHES',
    'inform': 'INFORMS',
    'discover': 'DISCOVERS',
    'reveal': 'REVEALS',
    'perform': 'PERFORMS',
    'execute': 'EXECUTES',
    'conduct': 'CONDUCTS',
    'organize': 'ORGANIZES',
    'host': 'HOSTS',
    'attend': 'ATTENDS',
    'fund': 'FUNDS',
    'finance': 'FINANCES',
    'invest': 'INVESTS_IN',
    'sponsor': 'SPONSORS',
    'pay': 'PAYS',
    'serve': 'SERVES',
    'provide': 'PROVIDES',
    'offer': 'OFFERS',
    'deliver': 'DELIVERS',
    'communicate': 'COMMUNICATES_WITH',
    'meet': 'MEETS_WITH',
    'discuss': 'DISCUSSES',
    'talk': 'TALKS_TO',
    'speak': 'SPEAKS_WITH',
    'correspond': 'CORRESPONDS_WITH',
    'oppose': 'OPPOSES',
    'compete': 'COMPETES_WITH',
    'rival': 'RIVALS',
    'conflict': 'CONFLICTS_WITH',
    'challenge': 'CHALLENGES',
    'measure': 'MEASURES',
    'quantify': 'QUANTIFIES',
    'evaluate': 'EVALUATES',
    'assess': 'ASSESSES',
    'comply': 'COMPLIES_WITH',
    'regulate': 'REGULATED_BY',
    'govern': 'GOVERNED_BY',
    'follow': 'FOLLOWS',
    'adhere': 'ADHERES_TO',
  };
  
  for (const [verb, relType] of Object.entries(actionVerbs)) {
    if (combined.includes(verb)) {
      return relType;
    }
  }
  
  return null;
};

/**
 * Enhanced entity type-based inference with context
 */
const inferFromEntityTypes = (
  sourceLabel: string,
  targetLabel: string,
  verbString: string,
  prepString: string,
  textBetween: string,
  isPassive: boolean
): string => {
  const combined = `${verbString} ${prepString} ${textBetween}`.toLowerCase();
  
  // Person -> Organization
  if (sourceLabel === 'Person' && targetLabel === 'Organization') {
    if (combined.includes('work') || combined.includes('employ') || combined.includes('join') || 
        combined.includes('staff') || combined.includes('hire')) {
      return 'WORKS_FOR';
    }
    if (combined.includes('found') || combined.includes('create') || combined.includes('establish') ||
        combined.includes('start') || combined.includes('launch')) {
      return 'FOUNDED';
    }
    if (combined.includes('lead') || combined.includes('direct') || combined.includes('head')) {
      return 'LEADS';
    }
    if (combined.includes('manage') || combined.includes('supervise')) {
      return 'MANAGES';
    }
    if (combined.includes('own') || combined.includes('control')) {
      return 'OWNS';
    }
    if (combined.includes('consult') || combined.includes('advise')) {
      return 'CONSULTS_FOR';
    }
    if (combined.includes('serve') || combined.includes('member')) {
      return 'MEMBER_OF';
    }
    return 'ASSOCIATED_WITH';
  }
  
  // Organization -> Person
  if (sourceLabel === 'Organization' && targetLabel === 'Person') {
    if (combined.includes('employ') || combined.includes('hire') || combined.includes('recruit')) {
      return 'EMPLOYS';
    }
    if (combined.includes('found') || combined.includes('create') || combined.includes('establish')) {
      return 'FOUNDED_BY';
    }
    if (combined.includes('lead') || combined.includes('direct') || combined.includes('head')) {
      return 'LED_BY';
    }
    if (combined.includes('own') || combined.includes('control')) {
      return 'OWNED_BY';
    }
    return 'ASSOCIATED_WITH';
  }
  
  // Organization -> Location
  if (sourceLabel === 'Organization' && targetLabel === 'Location') {
    if (combined.includes('locat') || combined.includes('base') || combined.includes('situat') ||
        combined.includes('headquarter') || combined.includes('office')) {
      return 'LOCATED_IN';
    }
    if (combined.includes('operate') || combined.includes('function')) {
      return 'OPERATES_IN';
    }
    return 'LOCATED_IN';
  }
  
  // Location -> Organization
  if (sourceLabel === 'Location' && targetLabel === 'Organization') {
    if (combined.includes('host') || combined.includes('contain') || combined.includes('house')) {
      return 'HOSTS';
    }
    if (combined.includes('base') || combined.includes('headquarter')) {
      return 'HEADQUARTERS_OF';
    }
    return 'CONTAINS';
  }
  
  // Person -> Location
  if (sourceLabel === 'Person' && targetLabel === 'Location') {
    if (combined.includes('from') || combined.includes('born') || combined.includes('origin')) {
      return 'FROM';
    }
    if (combined.includes('live') || combined.includes('reside') || combined.includes('located')) {
      return 'LIVES_IN';
    }
    if (combined.includes('work') || combined.includes('based')) {
      return 'WORKS_IN';
    }
    if (combined.includes('visit') || combined.includes('travel')) {
      return 'VISITS';
    }
    return 'LOCATED_IN';
  }
  
  // Location -> Person
  if (sourceLabel === 'Location' && targetLabel === 'Person') {
    if (combined.includes('born') || combined.includes('native')) {
      return 'BIRTHPLACE_OF';
    }
    return 'CONTAINS';
  }
  
  // Organization -> Organization
  if (sourceLabel === 'Organization' && targetLabel === 'Organization') {
    if (combined.includes('partner') || combined.includes('collaborate') || combined.includes('cooperate')) {
      return 'PARTNERS_WITH';
    }
    if (combined.includes('subsidiary') || combined.includes('acquire') || combined.includes('merge')) {
      return 'SUBSIDIARY_OF';
    }
    if (combined.includes('compete') || combined.includes('rival') || combined.includes('competitor')) {
      return 'COMPETES_WITH';
    }
    if (combined.includes('supply') || combined.includes('provide') || combined.includes('vendor')) {
      return 'SUPPLIES';
    }
    if (combined.includes('client') || combined.includes('customer') || combined.includes('serve')) {
      return 'SERVES';
    }
    if (combined.includes('parent') || combined.includes('own')) {
      return 'PARENT_OF';
    }
    return 'RELATED_TO';
  }
  
  // Concept -> Concept
  if (sourceLabel === 'Concept' && targetLabel === 'Concept') {
    if (combined.includes('include') || combined.includes('contain') || combined.includes('comprise')) {
      return 'INCLUDES';
    }
    if (combined.includes('part of') || combined.includes('component')) {
      return 'PART_OF';
    }
    if (combined.includes('similar') || combined.includes('like') || combined.includes('resemble')) {
      return 'SIMILAR_TO';
    }
    if (combined.includes('different') || combined.includes('unlike') || combined.includes('versus')) {
      return 'DIFFERENT_FROM';
    }
    if (combined.includes('relate') || combined.includes('connect') || combined.includes('link')) {
      return 'RELATED_TO';
    }
    if (combined.includes('cause') || combined.includes('lead') || combined.includes('result')) {
      return 'CAUSES';
    }
    if (combined.includes('depend') || combined.includes('rely') || combined.includes('require')) {
      return 'DEPENDS_ON';
    }
    return 'RELATED_TO';
  }
  
  // Concept -> Entity (Person/Organization)
  if (sourceLabel === 'Concept' && (targetLabel === 'Person' || targetLabel === 'Organization')) {
    if (combined.includes('define') || combined.includes('describe') || combined.includes('explain')) {
      return 'DEFINES';
    }
    if (combined.includes('use') || combined.includes('utilize') || combined.includes('apply')) {
      return 'USED_BY';
    }
    if (combined.includes('develop') || combined.includes('create') || combined.includes('invent')) {
      return 'DEVELOPED_BY';
    }
    return 'RELATED_TO';
  }
  
  // Entity (Person/Organization) -> Concept
  if ((sourceLabel === 'Person' || sourceLabel === 'Organization') && targetLabel === 'Concept') {
    if (combined.includes('use') || combined.includes('utilize') || combined.includes('apply') ||
        combined.includes('employ') || combined.includes('implement')) {
      return 'USES';
    }
    if (combined.includes('study') || combined.includes('research') || combined.includes('investigate') ||
        combined.includes('analyze') || combined.includes('examine')) {
      return 'STUDIES';
    }
    if (combined.includes('focus') || combined.includes('specialize') || combined.includes('expert')) {
      return 'FOCUSES_ON';
    }
    if (combined.includes('develop') || combined.includes('create') || combined.includes('design') ||
        combined.includes('invent') || combined.includes('build')) {
      return 'DEVELOPS';
    }
    if (combined.includes('define') || combined.includes('describe') || combined.includes('explain')) {
      return 'DEFINES';
    }
    if (combined.includes('teach') || combined.includes('instruct') || combined.includes('educate')) {
      return 'TEACHES';
    }
    if (combined.includes('know') || combined.includes('understand') || combined.includes('comprehend')) {
      return 'KNOWS';
    }
    return 'RELATED_TO';
  }
  
  // Default fallback - try to infer from prepositions
  if (prepString.includes('for')) {
    return 'FOR';
  }
  if (prepString.includes('with')) {
    return 'WITH';
  }
  if (prepString.includes('about') || prepString.includes('regarding')) {
    return 'ABOUT';
  }
  
  return 'RELATED_TO';
};

/**
 * Find all occurrences of an entity in text with better matching
 */
const findEntityOccurrences = (text: string, entityId: string, nodeIds: Set<string>): Array<{id: string, index: number, label: string}> => {
  const lowerText = text.toLowerCase();
  const lowerEntityId = entityId.toLowerCase();
  const occurrences: Array<{id: string, index: number, label: string}> = [];
  
  // Direct match
  let index = lowerText.indexOf(lowerEntityId);
  while (index !== -1) {
    // Check if it's a whole word match (not part of another word)
    const before = index > 0 ? lowerText[index - 1] : ' ';
    const after = index + lowerEntityId.length < lowerText.length 
      ? lowerText[index + lowerEntityId.length] 
      : ' ';
    
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
      occurrences.push({ id: entityId, index, label: '' });
    }
    
    index = lowerText.indexOf(lowerEntityId, index + 1);
  }
  
  return occurrences;
};

/**
 * Extract relationships between entities
 * Optimized: Reuses NLP doc and simplified sentence processing
 */
const extractRelationships = (text: string, nodes: Node[], doc?: any): Link[] => {
  const relStart = performance.now();
  
  // Reuse doc if provided, otherwise create new one
  const nlpDoc = doc || nlp(text);
  
  const links: Link[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // Extract sentences (much faster than processing each sentence separately)
  const sentences = nlpDoc.sentences().out('array');
  const lowerText = text.toLowerCase();
  
  // Process sentences - simplified approach without per-sentence NLP
  sentences.forEach((sentence, sentenceIndex) => {
    const lowerSentence = sentence.toLowerCase();
    const sentEntities: Array<{id: string, index: number, label: string}> = [];
    
    // Find entities in sentence using simple string matching (much faster)
    nodeIds.forEach(nodeId => {
      const index = lowerSentence.indexOf(nodeId);
      if (index !== -1) {
        // Check if it's a whole word match
        const before = index > 0 ? lowerSentence[index - 1] : ' ';
        const after = index + nodeId.length < lowerSentence.length 
          ? lowerSentence[index + nodeId.length] 
          : ' ';
        
        if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
          const node = nodeMap.get(nodeId);
          if (node && !sentEntities.some(e => e.id === nodeId)) {
            sentEntities.push({ id: nodeId, index, label: node.label });
          }
        }
      }
    });
    
    // Sort by position in sentence
    sentEntities.sort((a, b) => a.index - b.index);
    
    // Find relationships between entities in the same sentence (simplified)
    for (let i = 0; i < sentEntities.length; i++) {
      for (let j = i + 1; j < sentEntities.length; j++) {
        const source = sentEntities[i].id;
        const target = sentEntities[j].id;
        
        // Check if entities are close together (likely related)
        const distance = Math.abs(sentEntities[j].index - sentEntities[i].index);
        const isClose = distance < 150; // Within 150 characters
        
        if (isClose) {
          // Avoid duplicate links
          const linkExists = links.some(l => 
            (l.source === source && l.target === target) ||
            (l.source === target && l.target === source)
          );
          
          if (!linkExists) {
            links.push({
              source: source,
              target: target,
              type: 'RELATED_TO'
            });
          }
        }
      }
    }
  });
  
  const totalTime = performance.now() - relStart;
  console.log(`[PERF] ✅ Relationships: ${links.length} found in ${totalTime.toFixed(0)}ms`);
  
  return links;
};

/**
 * Helper function to filter out common words
 */
const isCommonWord = (word: string): boolean => {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'it', 'its', 'they', 'them', 'their', 'there'
  ]);
  return commonWords.has(word);
};

/**
 * Extract knowledge graph from text chunk using NLP
 * Optimized: Creates NLP doc once and reuses it for both entities and relationships
 */
export const extractGraphFromChunk = (chunk: string): GraphData => {
  const chunkStart = performance.now();
  
  try {
    // Create NLP doc once and reuse it (major performance improvement)
    const doc = nlp(chunk);
    
    // Extract entities using the shared doc
    const nodes = extractEntities(chunk, doc);
    
    // Extract relationships using the shared doc
    const links = extractRelationships(chunk, nodes, doc);
    
    const totalTime = performance.now() - chunkStart;
    console.log(`[PERF] ✅ Chunk: ${nodes.length} nodes, ${links.length} links in ${totalTime.toFixed(0)}ms`);
    
    return { nodes, links };
  } catch (error) {
    const totalTime = performance.now() - chunkStart;
    console.error(`[PERF] ❌ NLP error after ${totalTime.toFixed(0)}ms:`, error);
    return { nodes: [], links: [] };
  }
};

/**
 * Process a batch of pages - optimized for speed
 * Processes entire batch at once (faster) with minimal yields
 */
const processBatch = async (batchPages: PdfPage[], batchIndex: number, totalBatches: number): Promise<GraphData> => {
  const batchStart = performance.now();
  
  if (batchPages.length === 0) {
    return { nodes: [], links: [] };
  }
  
  // Combine all pages in batch at once (much faster than sub-chunks)
  const batchText = batchPages
    .map(page => page.content)
    .join('\n\n');
  
  if (!batchText.trim()) {
    return { nodes: [], links: [] };
  }
  
  // Extract from entire batch (optimized NLP reuse makes this fast)
  const result = extractGraphFromChunk(batchText);
  
  const batchTime = performance.now() - batchStart;
  console.log(`[PERF] ✅ Batch ${batchIndex + 1}/${totalBatches}: ${result.nodes.length} nodes, ${result.links.length} links in ${batchTime.toFixed(0)}ms`);
  
  return result;
};

/**
 * Process batches in parallel for maximum speed
 * Controlled concurrency prevents memory issues while maximizing throughput
 */
const processBatchesInParallel = async (
  batches: PdfPage[][],
  onProgress?: (current: number, total: number) => void
): Promise<GraphData> => {
  const allNodes: Node[] = [];
  const allLinks: Link[] = [];
  const nodeIdMap = new Map<string, Node>(); // For deduplication
  
  const totalStart = performance.now();
  console.log(`[PERF] 🚀 Processing ${batches.length} batches in parallel (${batches.reduce((sum, b) => sum + b.length, 0)} pages total)`);
  
  // Process batches in parallel with controlled concurrency
  // For large PDFs: 3-4 batches in parallel for optimal speed/memory balance
  const CONCURRENCY = Math.min(4, batches.length);
  
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const batchGroup = batches.slice(i, i + CONCURRENCY);
    
    // Process this group of batches in parallel
    const batchPromises = batchGroup.map((batch, groupIndex) => 
      processBatch(batch, i + groupIndex + 1, batches.length)
    );
    
    const batchResults = await Promise.all(batchPromises);
    
    // Merge results
    batchResults.forEach(result => {
      result.nodes.forEach(node => {
        const nodeIdLower = node.id.toLowerCase();
        if (!nodeIdMap.has(nodeIdLower)) {
          nodeIdMap.set(nodeIdLower, node);
          allNodes.push(node);
        }
      });
      allLinks.push(...result.links);
    });
    
    // Update progress
    if (onProgress) {
      onProgress(Math.min(i + CONCURRENCY, batches.length), batches.length);
    }
    
    // Brief yield between batch groups to keep UI responsive
    if (i + CONCURRENCY < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  const totalTime = performance.now() - totalStart;
  console.log(`[PERF] ✅ Complete: ${allNodes.length} nodes, ${allLinks.length} links in ${(totalTime/1000).toFixed(1)}s`);
  
  return { nodes: allNodes, links: allLinks };
};

/**
 * Extract graph from mixed PDF content (BATCHED, SEQUENTIAL with sub-chunks)
 * For text pages, divides into 200-page batches, each processed in 50-page sub-chunks
 * Processing is sequential with frequent yields to prevent UI blocking
 * For image pages, returns empty graph (images can't be processed without vision model)
 * 
 * @param pages - Array of PDF pages
 * @param onProgress - Optional progress callback (current, total)
 */
export const extractGraphFromMixedContent = async (
  pages: PdfPage[],
  onProgress?: (current: number, total: number) => void
): Promise<GraphData> => {
  const perfStart = performance.now();
  const textPages = pages.filter(page => page.type === 'text');
  
  console.log(`[PERF] 🚀 Starting extraction: ${textPages.length} text pages`);
  
  try {
    if (textPages.length === 0) {
      return { nodes: [], links: [] };
    }
    
    // Use larger batch size for speed (200 pages per batch)
    const BATCH_SIZE = 200;
    
    // Divide pages into batches
    const batches: PdfPage[][] = [];
    for (let i = 0; i < textPages.length; i += BATCH_SIZE) {
      batches.push(textPages.slice(i, i + BATCH_SIZE));
    }
    
    const totalBatches = batches.length;
    console.log(`[PERF] 📦 Divided ${textPages.length} pages into ${totalBatches} batches`);
    // Process batches in parallel for maximum speed
    const result = await processBatchesInParallel(batches, onProgress);
    
    const totalTime = performance.now() - perfStart;
    console.log(`[PERF] ✅ Extraction complete: ${result.nodes.length} nodes, ${result.links.length} links in ${(totalTime/1000).toFixed(1)}s`);
    
    return result;
  } catch (error) {
    const totalTime = performance.now() - perfStart;
    console.error(`[PERF] ❌ Extraction error after ${(totalTime/1000).toFixed(1)}s:`, error);
    return { nodes: [], links: [] };
  }
};

