-- Create post_drafts table for storing draft posts
CREATE TABLE IF NOT EXISTS post_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  caption TEXT,
  media_urls TEXT[], -- Array of media URLs
  platforms TEXT[], -- Array of platform names
  scheduled_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS post_drafts_user_id_idx ON post_drafts(user_id);

-- Create index on workspace_id for faster queries
CREATE INDEX IF NOT EXISTS post_drafts_workspace_id_idx ON post_drafts(workspace_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS post_drafts_created_at_idx ON post_drafts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE post_drafts ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own drafts
CREATE POLICY "Users can view their own drafts"
  ON post_drafts FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own drafts
CREATE POLICY "Users can create their own drafts"
  ON post_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own drafts
CREATE POLICY "Users can update their own drafts"
  ON post_drafts FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: Users can delete their own drafts
CREATE POLICY "Users can delete their own drafts"
  ON post_drafts FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_post_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function before update
CREATE TRIGGER update_post_drafts_updated_at_trigger
  BEFORE UPDATE ON post_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_post_drafts_updated_at();
