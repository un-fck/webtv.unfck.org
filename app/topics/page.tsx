'use client';
import Image from 'next/image';
import Link from 'next/link';
import { Play, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface TaggedSentence {
  text: string;
  speaker: string | { name?: string; affiliation?: string; affiliation_full?: string; function?: string };
  video_id: string;
  video_title: string;
  video_date: string;
}

interface TopicData {
  key: string;
  label: string;
  description: string;
  sentences: TaggedSentence[];
}

interface TopicItem {
  slug: string;
  text?: string;
  label?: string;
  description: string;
}

interface TopicsStructure {
  sg_actions: Record<string, TopicItem[]>;
  ms_proposals: Record<string, TopicItem[]>;
  other_topics: Record<string, TopicItem[]>;
}

function formatSpeaker(speaker: string | { name?: string | null; affiliation?: string | null; affiliation_full?: string | null; function?: string | null }) {
  if (typeof speaker === 'string') {
    return <span>{speaker}</span>;
  }
  
  const parts: string[] = [];
  if (speaker.name) parts.push(speaker.name);
  if (speaker.affiliation_full) parts.push(speaker.affiliation_full);
  else if (speaker.affiliation) parts.push(speaker.affiliation);
  
  return <span>{parts.length > 0 ? parts.join(' • ') : 'Unknown Speaker'}</span>;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCategoryLabel(key: string): string {
  const labels: Record<string, string> = {
    enhance_mandate_visibility_and_design: 'Enhance Mandate Visibility and Design',
    improve_reporting: 'Improve Reporting',
    improve_mandate_delivery_management: 'Improve Mandate Delivery Management',
    establish_effective_review_mechanisms: 'Establish Effective Review Mechanisms',
    effective_mandate_design: 'Effective Mandate Design',
    improve_mandate_delivery: 'Improve Mandate Delivery',
    support_mandate_review: 'Support Mandate Review',
  };
  return labels[key] || key;
}

export default function TopicsPage() {
  const [topicsData, setTopicsData] = useState<Record<string, TopicData>>({});
  const [categoriesData, setCategoriesData] = useState<TopicsStructure | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/topics').then(r => r.json()).then(d => d.topics),
      fetch('/data/actions-and-proposals.json').then(r => r.json())
    ]).then(([topics, categories]) => {
      setTopicsData(topics);
      setCategoriesData(categories);
      setLoading(false);
    });
  }, []);

  const toggleTopic = (slug: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  if (loading || !categoriesData) {
    return (
      <main className="min-h-screen bg-background px-4 sm:px-6">
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-gray-500">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 sm:px-6">
      <div className="max-w-4xl mx-auto py-8">
        <Image
          src="/images/UN Logo_Horizontal_English/Colour/UN Logo_Horizontal_Colour_English.svg"
          alt="UN Logo"
          width={200}
          height={40}
          className="h-10 w-auto mb-8"
        />

        <header className="mb-12">
          <div className="mb-4">
            <Link href="/" className="text-blue-600 hover:text-blue-800">
              ← Back to Videos
            </Link>
          </div>
          <h1 className="text-4xl font-light tracking-wide text-gray-800">
            UN80 Actions & Proposals
          </h1>
          <p className="text-gray-600 mt-2 text-sm">
            Secretary-General actions and Member State proposals
          </p>
        </header>

        {/* SG Actions */}
        <section className="mb-12">
          <h2 className="text-2xl font-medium text-gray-800 mb-6 pb-2 border-b-2 border-gray-300">
            Secretary-General Actions
          </h2>
          {Object.entries(categoriesData.sg_actions).map(([categoryKey, topics]) => (
            <div key={categoryKey} className="mb-8">
              <h3 className="text-lg font-medium text-gray-700 mb-4 px-2">
                {getCategoryLabel(categoryKey)}
              </h3>
              <div className="space-y-2">
                {topics.map((topic) => {
                  const topicData = topicsData[topic.slug];
                  const hasSentences = topicData && topicData.sentences.length > 0;
                  const isExpanded = expandedSections.has(topic.slug);
                  const sentenceCount = topicData?.sentences.length || 0;
                  
                  return (
                    <div key={topic.slug} className="border border-gray-200 rounded overflow-hidden">
                      <button
                        onClick={() => toggleTopic(topic.slug)}
                        className="w-full flex items-center justify-between text-left px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                          <span className="font-mono text-sm font-semibold text-gray-600 flex-shrink-0">{topic.slug}</span>
                          <span className="text-sm text-gray-800 truncate">{topic.text || topic.label}</span>
                        </div>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{sentenceCount}</span>
                      </button>
                      
                      {isExpanded && hasSentences && (
                        <div className="p-4 bg-gray-50 border-t border-gray-200">
                          <div className="flex flex-wrap gap-3">
                            {topicData.sentences.map((sentence, idx) => (
                              <div key={idx} className="bg-white p-3 rounded border border-gray-200 shadow-sm hover:shadow transition-shadow w-full sm:w-[calc(50%-0.375rem)]">
                                <p className="text-sm text-gray-800 mb-2">{sentence.text}</p>
                                <div className="text-xs text-gray-600 flex items-center justify-between gap-2">
                                  <span className="font-medium truncate">{formatSpeaker(sentence.speaker)}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-gray-500">{formatDate(sentence.video_date)}</span>
                                    <Link 
                                      href={`/video/${encodeURIComponent(sentence.video_id)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800"
                                      title="Watch video"
                                    >
                                      <Play className="w-3.5 h-3.5" />
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* MS Proposals */}
        <section className="mb-12">
          <h2 className="text-2xl font-medium text-gray-800 mb-6 pb-2 border-b-2 border-gray-300">
            Member State Proposals
          </h2>
          {Object.entries(categoriesData.ms_proposals).map(([categoryKey, topics]) => (
            <div key={categoryKey} className="mb-8">
              <h3 className="text-lg font-medium text-gray-700 mb-4 px-2">
                {getCategoryLabel(categoryKey)}
              </h3>
              <div className="space-y-2">
                {topics.map((topic) => {
                  const topicData = topicsData[topic.slug];
                  const hasSentences = topicData && topicData.sentences.length > 0;
                  const isExpanded = expandedSections.has(topic.slug);
                  const sentenceCount = topicData?.sentences.length || 0;
                  
                  return (
                    <div key={topic.slug} className="border border-gray-200 rounded overflow-hidden">
                      <button
                        onClick={() => toggleTopic(topic.slug)}
                        className="w-full flex items-center justify-between text-left px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                          <span className="font-mono text-sm font-semibold text-gray-600 flex-shrink-0">{topic.slug}</span>
                          <span className="text-sm text-gray-800 truncate">{topic.text || topic.label}</span>
                        </div>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{sentenceCount}</span>
                      </button>
                      
                      {isExpanded && hasSentences && (
                        <div className="p-4 bg-gray-50 border-t border-gray-200">
                          <div className="flex flex-wrap gap-3">
                            {topicData.sentences.map((sentence, idx) => (
                              <div key={idx} className="bg-white p-3 rounded border border-gray-200 shadow-sm hover:shadow transition-shadow w-full sm:w-[calc(50%-0.375rem)]">
                                <p className="text-sm text-gray-800 mb-2">{sentence.text}</p>
                                <div className="text-xs text-gray-600 flex items-center justify-between gap-2">
                                  <span className="font-medium truncate">{formatSpeaker(sentence.speaker)}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-gray-500">{formatDate(sentence.video_date)}</span>
                                    <Link 
                                      href={`/video/${encodeURIComponent(sentence.video_id)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800"
                                      title="Watch video"
                                    >
                                      <Play className="w-3.5 h-3.5" />
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
