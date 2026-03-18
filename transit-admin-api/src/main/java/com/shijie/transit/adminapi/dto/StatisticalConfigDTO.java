package com.shijie.transit.adminapi.dto;

import java.util.List;

public class StatisticalConfigDTO {
    private List<Dimension> dimensions;
    private Thresholds thresholds;
    private List<String> highIntentKeywords;
    private List<String> lowIntentKeywords;

    public List<Dimension> getDimensions() {
        return dimensions;
    }

    public void setDimensions(List<Dimension> dimensions) {
        this.dimensions = dimensions;
    }

    public Thresholds getThresholds() {
        return thresholds;
    }

    public void setThresholds(Thresholds thresholds) {
        this.thresholds = thresholds;
    }

    public List<String> getHighIntentKeywords() {
        return highIntentKeywords;
    }

    public void setHighIntentKeywords(List<String> highIntentKeywords) {
        this.highIntentKeywords = highIntentKeywords;
    }

    public List<String> getLowIntentKeywords() {
        return lowIntentKeywords;
    }

    public void setLowIntentKeywords(List<String> lowIntentKeywords) {
        this.lowIntentKeywords = lowIntentKeywords;
    }

    public static class Dimension {
        private String key;
        private String name;
        private Integer weight;
        private List<Level> levels;

        public String getKey() {
            return key;
        }

        public void setKey(String key) {
            this.key = key;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public Integer getWeight() {
            return weight;
        }

        public void setWeight(Integer weight) {
            this.weight = weight;
        }

        public List<Level> getLevels() {
            return levels;
        }

        public void setLevels(List<Level> levels) {
            this.levels = levels;
        }
    }

    public static class Level {
        private String name;
        private Integer score;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public Integer getScore() {
            return score;
        }

        public void setScore(Integer score) {
            this.score = score;
        }
    }

    public static class Thresholds {
        private Integer high;
        private Integer medium;

        public Integer getHigh() {
            return high;
        }

        public void setHigh(Integer high) {
            this.high = high;
        }

        public Integer getMedium() {
            return medium;
        }

        public void setMedium(Integer medium) {
            this.medium = medium;
        }
    }
}
