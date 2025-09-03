const OpenAI = require('openai');
const taskManager = require('./taskManager');
const logger = require('../utils/logger');

class SmartTaskCreator {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
  }

  async parseNaturalLanguageRequest(request, context = {}) {
    try {
      const prompt = this.buildTaskParsingPrompt(request, context);
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Create the tasks
      const createdTasks = [];
      for (const taskData of result.tasks) {
        const task = taskManager.createTask(taskData);
        createdTasks.push(task);
      }

      logger.info(`Created ${createdTasks.length} tasks from natural language request`);
      
      return {
        success: true,
        tasks: createdTasks,
        summary: result.summary,
        suggestions: result.suggestions || []
      };
      
    } catch (error) {
      logger.error('Failed to parse natural language request:', error);
      throw new Error(`Task parsing failed: ${error.message}`);
    }
  }

  getSystemPrompt() {
    return `You are an AI hackathon production assistant. Your role is to help organize an AI hackathon on September 24th, 2024.

CONTEXT:
- Current date: ${new Date().toISOString().split('T')[0]}
- Hackathon date: September 24th, 2024
- Days remaining: ${taskManager.getDaysUntilHackathon()}

CATEGORIES:
venue, catering, tech, marketing, sponsors, registration, logistics, judging, prizes, content

TASK PRIORITIES:
- critical: Must be done or event fails
- high: Important for event success
- medium: Good to have
- low: Nice to have

Your job is to parse natural language requests into structured tasks. Always respond with valid JSON in this format:

{
  "tasks": [
    {
      "title": "Clear, actionable task title",
      "description": "Detailed description with context",
      "category": "appropriate category",
      "priority": "critical|high|medium|low",
      "dueDate": "ISO date string",
      "estimatedHours": number,
      "tags": ["relevant", "tags"],
      "assignee": "person name if mentioned",
      "isOnCriticalPath": boolean,
      "dependencies": ["task titles this depends on"]
    }
  ],
  "summary": "Brief summary of what was created",
  "suggestions": ["Additional suggestions for related tasks"]
}

Set realistic due dates based on the hackathon timeline and task complexity.`;
  }

  buildTaskParsingPrompt(request, context) {
    const daysLeft = taskManager.getDaysUntilHackathon();
    const existingTasks = taskManager.getAllTasks().map(t => ({
      title: t.title,
      category: t.category,
      status: t.status
    }));
    
    return `
REQUEST: ${request}

CONTEXT:
- Days until hackathon: ${daysLeft}
- Existing tasks: ${JSON.stringify(existingTasks, null, 2)}
- Additional context: ${JSON.stringify(context, null, 2)}

Parse this request into structured tasks. Consider:
1. What specific actions need to be taken?
2. What category does each task belong to?
3. When should each task be completed relative to the hackathon date?
4. Who might be responsible (if mentioned)?
5. Are there dependencies between tasks?
6. What priority level is appropriate?

Respond with valid JSON only.`;
  }

  async suggestMissingTasks() {
    try {
      const gaps = taskManager.identifyGaps();
      const stats = taskManager.getCompletionStats();
      const daysLeft = taskManager.getDaysUntilHackathon();
      
      const prompt = `
HACKATHON ANALYSIS:
- Days remaining: ${daysLeft}
- Completion rate: ${stats.completionRate}%
- Overdue tasks: ${stats.overdue}
- At-risk tasks: ${stats.atRisk}
- Identified gaps: ${JSON.stringify(gaps, null, 2)}

Current tasks by category:
${this.getCategoryBreakdown()}

Based on this analysis, suggest 3-5 additional tasks that should be created for a successful hackathon. Consider:
1. Critical missing elements
2. Timeline pressure
3. Common hackathon requirements not yet covered
4. Risk mitigation

Respond with valid JSON in the same task format.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 1500
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      logger.info(`AI suggested ${result.tasks.length} missing tasks`);
      return result;
      
    } catch (error) {
      logger.error('Failed to suggest missing tasks:', error);
      throw new Error(`Task suggestion failed: ${error.message}`);
    }
  }

  getCategoryBreakdown() {
    const tasks = taskManager.getAllTasks();
    const breakdown = {};
    
    tasks.forEach(task => {
      if (!breakdown[task.category]) {
        breakdown[task.category] = { total: 0, completed: 0, pending: 0 };
      }
      breakdown[task.category].total++;
      if (task.status === 'completed') {
        breakdown[task.category].completed++;
      } else {
        breakdown[task.category].pending++;
      }
    });
    
    return Object.entries(breakdown)
      .map(([cat, data]) => `${cat}: ${data.completed}/${data.total} completed`)
      .join('\n');
  }

  async autoAssignTasks(tasks, teamContext = {}) {
    try {
      const prompt = `
TEAM CONTEXT: ${JSON.stringify(teamContext, null, 2)}

TASKS TO ASSIGN:
${JSON.stringify(tasks.map(t => ({
  id: t.id,
  title: t.title,
  category: t.category,
  priority: t.priority,
  estimatedHours: t.estimatedHours
})), null, 2)}

Based on the team context and task requirements, suggest appropriate assignees for each task.
Consider:
1. Person's expertise and role
2. Current workload
3. Task category alignment
4. Availability

Respond with JSON:
{
  "assignments": [
    {
      "taskId": "task_id",
      "assignee": "person_name",
      "reason": "why this person is suitable"
    }
  ],
  "workloadWarnings": ["any concerns about workload distribution"]
}`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a task assignment specialist for hackathon planning.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Apply assignments
      result.assignments.forEach(assignment => {
        try {
          taskManager.updateTask(assignment.taskId, {
            assignee: assignment.assignee
          });
          const task = taskManager.getTask(assignment.taskId);
          task.addNote(`Auto-assigned to ${assignment.assignee}: ${assignment.reason}`, 'ai-assistant');
        } catch (error) {
          logger.error(`Failed to assign task ${assignment.taskId}:`, error);
        }
      });
      
      logger.info(`Auto-assigned ${result.assignments.length} tasks`);
      return result;
      
    } catch (error) {
      logger.error('Failed to auto-assign tasks:', error);
      throw new Error(`Task assignment failed: ${error.message}`);
    }
  }

  async generateTaskRecommendations(taskId) {
    try {
      const task = taskManager.getTask(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      const prompt = `
TASK ANALYSIS:
${JSON.stringify(task.toJSON(), null, 2)}

HACKATHON CONTEXT:
- Days remaining: ${taskManager.getDaysUntilHackathon()}
- Task status: ${task.status}
- Priority: ${task.priority}
- Due in: ${task.getDaysUntilDue()} days
- Is overdue: ${task.isOverdue()}
- Is at risk: ${task.isAtRisk()}

Provide specific, actionable recommendations for this task. Consider:
1. Next steps to complete the task
2. Potential blockers and how to overcome them
3. Resources or people that might help
4. Ways to break down the task if it's too large
5. Timeline optimization

Respond with JSON:
{
  "nextActions": ["specific actionable steps"],
  "resources": ["people, tools, or information needed"],
  "risks": ["potential issues to watch for"],
  "optimizations": ["ways to improve efficiency"],
  "breakdown": ["if task should be split, suggest subtasks"]
}`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a task optimization expert for hackathon planning.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      return JSON.parse(response.choices[0].message.content);
      
    } catch (error) {
      logger.error('Failed to generate task recommendations:', error);
      throw new Error(`Task recommendations failed: ${error.message}`);
    }
  }
}

module.exports = new SmartTaskCreator();