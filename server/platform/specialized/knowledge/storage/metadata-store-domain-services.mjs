import { createSearchService } from "../retrieval/search-service.mjs";
import {
  buildSearchTerms,
  compileRuleSet,
  tokenizeText
} from "../preprocessing/domain/rules/index.mjs";
import { createTransactionLifecycleService } from "../preprocessing/domain/rules/transaction-lifecycle-service.mjs";
import { loadEmailRules } from "../preprocessing/domain/rules/email-rules.mjs";

export function createKnowledgeMetadataStoreDomainServices() {
  return Object.freeze({
    createTextIndexingService: () => ({
      buildSearchTerms,
      compileRuleSet,
      tokenizeText
    }),
    createSearchService,
    createTransactionLifecycleService,
    loadRules: loadEmailRules
  });
}
