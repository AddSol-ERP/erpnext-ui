# AI Conversational ERP Workspace — Requirement Summary & Execution Plan

## Vision

Build an:

“AI-native conversational operational layer over ERP systems”

starting with ERPNext.

The system should allow users to:

- perform ERP operations through conversation
- upload files/images/documents
- receive guided prompts for missing information
- review structured drafts
- approve/reject workflows
- operate business processes from a single workspace

Instead of:

- navigating complex ERP menus/forms/screens.

---

# Core Product Concept

## Conversational ERP Workspace

A hybrid interface combining:

- chat/conversation
- structured forms
- dynamic previews
- approval flows
- reports
- operational dashboards

The system behaves like:
an intelligent ERP operator assistant.

---

# Primary Objectives

## Reduce ERP Friction

- fewer clicks
- less navigation
- lower training requirements
- faster operations

---

## Enable Natural Interaction

Users can:

- type commands
- upload PDFs/images
- provide partial information
- answer follow-up questions

---

## AI-Assisted Operations

AI helps:

- understand intent
- extract entities
- populate forms
- detect missing fields
- guide workflows

But:

- business logic remains deterministic
- user remains in control
- ERP remains system of record

---

# Product Scope (Phase 1)

## Initial Modules

### CRM & Sales

- Lead creation
- Quotation creation
- Sales Order creation
- Customer lookup
- Item lookup
- Follow-up workflows

---

## Approval Operations

- quotation approvals
- leave approvals
- expense approvals
- purchase approvals

---

## File-Based Operations

Support:

- PDF upload
- invoice images
- quotation screenshots
- document extraction

---

# Current Frontend Foundation

A modern React 19 SPA already exists with:

- reusable CRUD architecture
- generic form/list components
- approval engine
- modal/drawer system
- report views
- workflow-friendly UI

This existing frontend becomes:
the rendering engine for conversational operations.

---

# Existing Reusable UI System

## Shared Components Already Built

### CRUD/UI Components

- ListLayout
- ListView
- ChildTable
- FormField
- LinkField
- Pagination

### Workflow Components

- ApprovalPreview
- ApprovalList
- RightDrawer
- AppModal

### Dashboard Components

- ActionTile
- StatCard
- Section

These components become:
AI-driven render targets.

---

# Target User Experience

## Example Flow

User:
Create quotation for Tata Motors for 50 helmets

AI:

- searches customer
- searches items
- detects missing fields
- asks:
  - warehouse?
  - delivery date?
  - tax template?

Then:

- opens quotation draft
- pre-fills data
- highlights missing fields
- user edits if needed
- submits to ERP

---

# Core Architecture

User Input (Text/File/Image)
↓
Conversation Engine
↓
Intent + Entity Extraction
↓
Workflow Resolver
↓
Action Schema Generator
↓
Frontend Renderer
↓
Existing React Components
↓
ERP Adapter Layer
↓
ERPNext APIs

---

# Architectural Principles

## AI Does NOT Own Truth

Truth is owned by:

- PostgreSQL
- ERPNext
- workflow engine

AI only:

- interprets
- extracts
- assists
- suggests

---

# Deterministic Workflows

Workflow logic must remain backend-controlled.

AI should NOT:

- directly mutate ERP
- bypass validations
- control approvals

---

# Human-in-the-Loop

All important actions follow:

Extract
→ Draft
→ Review
→ Approval
→ Submit

---

# Backend Strategy

## Build New Communication Engine

Instead of replacing ERP backend immediately.

The new backend owns:

- conversations
- workflow sessions
- AI orchestration
- memory/context
- extraction state
- action execution

ERPNext remains:

- transactional backend
- accounting backend
- inventory backend

---

# Recommended Backend Stack

| Layer          | Recommendation |
| -------------- | -------------- |
| API Backend    | FastAPI        |
| Database       | PostgreSQL     |
| Vector Search  | pgvector       |
| Cache          | Redis          |
| Async Queue    | Celery/RQ      |
| Realtime       | WebSocket/SSE  |
| OCR/Extraction | Gemini         |
| Primary LLM    | Gemini Flash   |

---

# Conversation Engine Responsibilities

## Session Management

- message history
- workflow continuity
- conversational memory

---

## Missing Field Detection

Example:

- customer missing
- warehouse missing
- delivery date missing

AI prompts only for required information.

---

## Multimodal Understanding

Support:

- PDFs
- screenshots
- invoices
- images
- later: voice

---

# Required Backend Data Model

## Core Tables

users
organizations
conversations
messages
attachments
workflow_sessions
workflow_steps
tool_executions
document_extractions
entity_memory

---

# Workflow State Machine

Every workflow should have states:

collecting_data
→ validating
→ preview
→ approval
→ submit
→ completed

---

# AI Integration Strategy

## Tool-Based Architecture

LLM never performs direct CRUD.

Instead it calls tools like:

search_customer()
search_item()
create_quotation_draft()
apply_workflow()
extract_document()
get_stock()

Backend executes safely.

---

# Frontend Integration Strategy

## AI Returns Action Schemas

Example:

{
"action": "open_form",
"doctype": "Quotation",
"layout": "drawer",
"mode": "draft",
"data": {
"customer": "Tata Motors"
},
"missing_fields": [
"delivery_date"
]
}

Frontend maps schema into:

- RightDrawer
- AppModal
- ChildTable
- existing forms

---

# Recommended UI Layout

## Left Panel

Conversation timeline

## Main Panel

Dynamic forms/previews/reports

## Right Panel

Contextual insights:

- customer history
- pending invoices
- stock
- AI suggestions

---

# Phased Execution Plan

# Phase 1 — Foundation

## Goals

Build communication engine + orchestration layer.

### Tasks

- FastAPI backend
- PostgreSQL schema
- conversation sessions
- message APIs
- AI orchestration service
- workflow state machine

---

# Phase 2 — AI-Assisted CRUD

## Goals

Connect AI with existing frontend.

### Tasks

- action schema design
- intent detection
- entity extraction
- form auto-fill
- missing field prompts
- draft creation

### Initial Workflows

- quotation creation
- sales order creation
- leave request
- expense claim

---

# Phase 3 — Multimodal Operations

## Goals

Enable document-driven workflows.

### Tasks

- PDF extraction
- image OCR
- structured extraction
- document-to-draft workflows

### Examples

- invoice upload → expense draft
- quotation PDF → quotation form
- screenshot → order creation

---

# Phase 4 — Approval Intelligence

## Goals

AI-assisted workflow approvals.

### Tasks

- approval summaries
- risk detection
- approval recommendations
- conversational approval actions

---

# Phase 5 — Advanced Operational Intelligence

## Goals

Natural business operations.

### Examples

- “Show overdue payments”
- “Convert approved quotations to SO”
- “Follow up pending leads”
- “Create dispatch plan”

---

# Long-Term Vision

Eventually evolve into:

“AI Operational OS for Business Systems”

Supporting:

- ERPNext
- SAP
- Zoho
- Tally
- custom ERP adapters

without rewriting the conversational engine.

---

# Key Strategic Decisions

## DO

- keep AI separate from business logic
- use structured action schemas
- maintain deterministic workflows
- keep human approvals
- leverage existing frontend architecture

---

## DO NOT

- replace all UI with chat
- let AI directly mutate ERP
- tightly couple AI with React state
- rebuild accounting engine early

---

# Final Strategic Positioning

This is NOT:

- a chatbot
- another ERP frontend
- an ERP replacement

This is:

“An AI-native operational workspace for enterprise workflows”

built on top of existing ERP systems with:

- conversation
- multimodal understanding
- workflow orchestration
- guided operations
- intelligent approvals
