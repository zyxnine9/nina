import getExploreOverview from './getExploreOverview';
import getExploreKnowledge from './getExploreKnowledge';
import getExploreInterest from './getExploreInterest';
import getExploreThinking from './getExploreThinking';
import getExplorePersona from './getExplorePersona';
import getExploreUnknown from './getExploreUnknown';
import getExploreFeedback from './getExploreFeedback';
import getKnowledgeDetail from './getKnowledgeDetail';

export default [
  getExploreOverview,
  getExploreKnowledge,
  getExploreInterest,
  getExploreThinking,
  getExplorePersona,
  getExploreUnknown,
  ...getExploreFeedback,
  ...getKnowledgeDetail,
];
