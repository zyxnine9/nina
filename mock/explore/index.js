import getExploreOverview from './getExploreOverview';
import getExploreKnowledge from './getExploreKnowledge';
import getExploreInterest from './getExploreInterest';
import getKnowledgeDetail from './getKnowledgeDetail';

export default [getExploreOverview, getExploreKnowledge, getExploreInterest, ...getKnowledgeDetail];
