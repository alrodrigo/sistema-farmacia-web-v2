-- Migration: Add icon and description to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS icon text DEFAULT 'medication',
ADD COLUMN IF NOT EXISTS description text;
