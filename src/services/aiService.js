const OpenAI = require('openai');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
  }

  async analyze(data, type = 'general') {
    try {
      const prompt = this.buildAnalysisPrompt(data, type);
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an AI production assistant specializing in analyzing production systems, code, logs, and operational data. Provide clear, actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      return {
        type: type,
        analysis: response.choices[0].message.content,
        timestamp: new Date().toISOString(),
        confidence: this.calculateConfidence(response.choices[0].message.content)
      };
    } catch (error) {
      logger.error('AI analysis failed:', error);
      throw new Error(`AI analysis failed: ${error.message}`);
    }
  }

  async generateSuggestion(context, task) {
    try {
      const prompt = `
        Context: ${context}
        Task: ${task}
        
        Please provide specific, actionable suggestions for improving or completing this task in a production environment.
        Consider performance, reliability, security, and maintainability.
      `;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an AI production assistant. Provide practical, implementable suggestions for production systems.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 1500
      });

      return {
        suggestion: response.choices[0].message.content,
        context: context,
        task: task,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Suggestion generation failed:', error);
      throw new Error(`Suggestion generation failed: ${error.message}`);
    }
  }

  buildAnalysisPrompt(data, type) {
    const basePrompts = {
      logs: `Analyze these production logs for issues, patterns, and recommendations:\n\n${data}`,
      metrics: `Analyze these system metrics and provide insights:\n\n${data}`,
      code: `Review this code for production readiness, potential issues, and improvements:\n\n${data}`,
      deployment: `Analyze this deployment configuration and suggest optimizations:\n\n${data}`,
      general: `Analyze the following production data and provide insights:\n\n${data}`
    };

    return basePrompts[type] || basePrompts.general;
  }

  calculateConfidence(content) {
    // Simple confidence calculation based on response characteristics
    const hasSpecificRecommendations = /recommend|suggest|should|could|might/.test(content.toLowerCase());
    const hasNumbers = /\d+/.test(content);
    const hasCodeExamples = /```/.test(content);
    
    let confidence = 0.5; // Base confidence
    
    if (hasSpecificRecommendations) confidence += 0.2;
    if (hasNumbers) confidence += 0.15;
    if (hasCodeExamples) confidence += 0.15;
    
    return Math.min(confidence, 0.95); // Cap at 95%
  }

  async healthCheck() {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });
      return { status: 'healthy', model: this.model };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

module.exports = new AIService();